import {
  isActingSeat,
  isVeilHandle,
  type GameSession,
  type LegalMove,
  type Rng,
} from '@parlour/engine';
import { isBlitz } from '@parlour/game-blitz';
import { wildpileDiscardAllCards } from '@parlour/game-wildpile';
import { isStaleMoveFault } from '@/lib/table/useRoomTable';
import {
  multiplayerSession,
  type MultiplayerGameId,
  type MultiplayerRoomSession,
} from '../roomSession';

/**
 * A seat's cockpit: the moves its table screen can actually express, and how
 * the screen would dispatch each one.
 *
 * The point of the harness is to play the way a person at the real UI can, so
 * a cockpit deliberately mirrors the game's `renderRoom` handlers rather than
 * the engine's full legal-move list. A legal move the screen offers no control
 * for is a move no human can send — if the game cannot finish without it, that
 * is a product bug, and it shows up here as the stall it is at a real table.
 */
export interface Cockpit {
  /** moves this game's room screen has a control for */
  expressible: ReadonlySet<string>;
  /** mirrors any extra gating the screen puts in front of a control */
  offers?(session: GameSession<unknown, never>, localSeat: number, move: LegalMove): boolean;
  /** mirrors the screen's dispatch — e.g. Wild's colour dump carries reveals */
  dispatch(
    peer: MultiplayerRoomSession,
    session: GameSession<unknown, never>,
    localSeat: number,
    move: LegalMove,
  ): void;
}

const wildCockpit: Cockpit = {
  // Every handler WildTableScreen wires up in wild.tsx renderRoom.
  expressible: new Set([
    'playCard',
    'draw',
    'pass',
    'chooseColor',
    'chooseTarget',
    'declineJump',
    'callLastCard',
    'challengeDrawFour',
  ]),
  dispatch(peer, session, localSeat, move) {
    if (move.id === 'playCard') {
      // Dumping a colour makes several cards public at once, so the move
      // carries every opening it performs — same as the table screen.
      const card = (move.payload as { card: string }).card;
      const hands = (session.state as { hands?: readonly string[][] }).hands;
      const mine = hands?.[localSeat] ?? [];
      peer.send('playCard', { card }, wildpileDiscardAllCards(mine, card));
      return;
    }
    peer.send(move.id, move.payload);
  },
};

const blitzCockpit: Cockpit = {
  // TableScreen's blitz surface: draw either way, discard, knock, and the
  // veiled-table "Blitz!" claim. `showdown.open` is deliberately absent — the
  // room answers that one itself, and if that automation ever breaks, the
  // harness reports the stall a real table would show.
  expressible: new Set(['draw.stock', 'draw.discard', 'discard', 'knock', 'blitz.claim']),
  offers(session, localSeat, move) {
    if (move.id !== 'blitz.claim') return true;
    // The screen only shows "Blitz!" over a readable, genuine 31.
    const hands = (session.state as { hands?: readonly string[][] }).hands;
    const mine = hands?.[localSeat] ?? [];
    return mine.length === 3 && mine.every((card) => !isVeilHandle(card)) && isBlitz(mine);
  },
  dispatch(peer, session, localSeat, move) {
    if (move.id === 'blitz.claim') {
      // The claim proves itself by opening the whole hand — same as the screen.
      const hands = (session.state as { hands?: readonly string[][] }).hands;
      peer.send('blitz.claim', undefined, hands?.[localSeat] ?? []);
      return;
    }
    peer.send(move.id, move.payload);
  },
};

export const COCKPITS: Partial<Record<MultiplayerGameId, Cockpit>> = {
  wildpile: wildCockpit,
  blitz: blitzCockpit,
};

export interface ActorReport {
  /** engine refusals that were NOT stale-tap noise — each one is a finding */
  errors: string[];
  /** stale-tap refusals the UI swallows; counted, because a flood is a smell */
  staleTaps: number;
  /** moves actually accepted for sending */
  sent: number;
}

/**
 * Plays at most one action for this seat, exactly as the table screen would:
 * read the presented snapshot, enumerate legal moves, keep the ones the screen
 * can express, choose with the game's own bot policy (or uniformly at random
 * with probability `chaos`, to reach the odd corners a policy never visits),
 * and dispatch through the same try/catch the shared room-table hook uses.
 *
 * Returns true when a move was sent.
 */
export function stepActor(
  peer: MultiplayerRoomSession,
  gameId: MultiplayerGameId,
  rng: Rng,
  report: ActorReport,
  chaos = 0.15,
): boolean {
  const cockpit = COCKPITS[gameId];
  if (!cockpit) throw new Error(`no cockpit for ${gameId}`);
  const snapshot = peer.getSnapshot();
  if (snapshot.stage !== 'table' || snapshot.localSeat === null) return false;
  const session = multiplayerSession<unknown, never>(snapshot, gameId);
  if (!session || session.status !== 'playing') return false;
  const seat = snapshot.localSeat;
  if (!isActingSeat(session.phase, seat)) return false;

  let legal: readonly LegalMove[] = [];
  try {
    legal =
      session.def.flow.legalMovesFor?.(session.state, session.phase, seat) ??
      session.def.flow.legalMoves(session.state, session.phase);
  } catch {
    return false;
  }
  const offered = legal.filter(
    (move) => cockpit.expressible.has(move.id) && (cockpit.offers?.(session, seat, move) ?? true),
  );
  if (offered.length === 0) return false;

  let move: LegalMove | null = null;
  if (rng.float() >= chaos) {
    const bot = session.def.bots[0];
    try {
      move =
        bot?.chooseMove(session.state as never, seat, offered, rng, { thinkMs: () => 0 }) ?? null;
    } catch {
      move = null;
    }
    // A policy may pick a move the screen cannot express; fall back to chance.
    if (move && !cockpit.expressible.has(move.id)) move = null;
  }
  move ??= offered[rng.int(offered.length)]!;

  try {
    cockpit.dispatch(peer, session, seat, move);
    report.sent++;
    return true;
  } catch (caught) {
    if (isStaleMoveFault(caught)) {
      report.staleTaps++;
      return false;
    }
    report.errors.push(
      `seat ${seat} sending ${move.id}: ${caught instanceof Error ? caught.message : String(caught)}`,
    );
    return false;
  }
}

/**
 * The host side of Wild's clocks, as `useRoomClocks` runs them: when the same
 * actor has been on the same turn past the configured seconds, the host
 * injects the timeout; when the match clock runs out, likewise. Injection can
 * lose its race with a real move — the same catch the effect has swallows it.
 */
export class WildClockActor {
  private turnKey = '';
  private turnArmedAt = 0;
  private matchAnchoredAt: number | null = null;
  /** timeouts actually injected — a rescue means somebody sat a full clock */
  rescues = 0;
  matchExpired = false;

  step(host: MultiplayerRoomSession, now: number): void {
    const snapshot = host.getSnapshot();
    if (!snapshot.isHost || snapshot.stage !== 'table') return;
    const session = multiplayerSession<
      { turn: number },
      { turnTimeSeconds: number; matchTimeMinutes?: number }
    >(snapshot, 'wildpile');
    if (!session || session.status !== 'playing') return;

    this.matchAnchoredAt ??= now;
    const matchEndsAt = this.matchAnchoredAt + (session.config.matchTimeMinutes ?? 5) * 60_000;
    if (now >= matchEndsAt && !this.matchExpired) {
      this.matchExpired = true;
      try {
        host.inject('timeout', { kind: 'match' });
      } catch {
        // A hand emptied at the same instant; that result wins the race.
      }
      return;
    }

    const actor = session.phase.actor;
    if (actor === null) return;
    const key = `${session.log.length}:${actor}`;
    if (key !== this.turnKey) {
      this.turnKey = key;
      this.turnArmedAt = now;
      return;
    }
    if (now - this.turnArmedAt < session.config.turnTimeSeconds * 1_000) return;
    this.turnArmedAt = now;
    this.rescues++;
    try {
      host.inject('timeout', { kind: 'turn', actor });
    } catch {
      // The move that beat the clock already replaced this timer's phase.
    }
  }
}
