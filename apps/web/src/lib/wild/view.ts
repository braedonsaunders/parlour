import type { FxEvent, LegalMove } from '@parlour/engine';
import { CHALLENGE_PENALTY, type WildpileColor } from '@parlour/game-wildpile';
import { getWildMode, type WildModeId } from '@/lib/wild/modes';
import type { WildSnapshot } from '@/lib/solo/WildTransport';

export type WildDecision = 'play' | 'choose-color' | 'choose-target' | 'jump-in';

export interface WildSeatView {
  seat: number;
  name: string;
  avatarId: string;
  handCount: number;
  isLocal: boolean;
  isBot: boolean;
  /** True once the seat has armed last-card protection. */
  lastCardArmed: boolean;
}

export interface WildTableView {
  players: readonly WildSeatView[];
  localSeat: number;
  activeSeat: number | null;
  stockCount: number;
  /** Top-first, capped for the pile display. */
  discard: readonly string[];
  activeColor: WildpileColor | null;
  direction: 1 | -1;
  pendingDraw: number;
  phaseLabel: string;
  hand: readonly string[];
  /** The local seat's pending decision, or null while others act. */
  decision: WildDecision | null;
  /** True once the local seat has armed last-card protection. */
  lastCardArmed: boolean;
  /** Card the local seat just drew and may still play, if any. */
  drawnCard: string | null;
  /** An open Draw Four the local seat may call a bluff, or null. */
  challenge: {
    accused: number;
    accusedName: string;
    /** Cards riding on the answer, before the penalty for a bad call. */
    amount: number;
    /** What a failed challenge would cost instead. */
    penalty: number;
    /**
     * Cards this seat could answer with, growing the pile and passing the
     * accusation on. Empty when the seat holds nothing stackable, which is the
     * usual case — most hands cannot answer a Draw Four.
     */
    stackCards: readonly string[];
    /** What the pickup becomes if this seat stacks: more cards, next seat's problem. */
    stackAmount: number;
  } | null;
  /**
   * Someone reached one card without calling it. Catching is a player's shout,
   * not the table's bookkeeping, so this is public state every seat sees live —
   * the local seat may act on it even off turn.
   */
  catchable: { seat: number; name: string } | null;
  legal: {
    playCards: readonly string[];
    draw: boolean;
    declineJump: boolean;
    chooseColor: boolean;
    callLastCard: boolean;
    catchLastCard: boolean;
    challengeDrawFour: boolean;
    /** Decline the card you just drew. Absent when the table forces the play. */
    pass: boolean;
    /** Seats whose hand the local seat may take. */
    swapTargets: readonly number[];
  };
}

function payloadCard(move: LegalMove): string | null {
  const card = (move.payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' ? card : null;
}

function payloadSeat(move: LegalMove): number | null {
  const seat = (move.payload as { seat?: unknown } | undefined)?.seat;
  return typeof seat === 'number' ? seat : null;
}

function localDecision(phase: string, offered: readonly LegalMove[]): WildDecision | null {
  if (phase === 'choose-color') return 'choose-color';
  if (phase === 'choose-target') return 'choose-target';
  if (phase === 'interrupt') {
    // Veil opens this window to every seat. Only prompt when this hand can
    // actually jump; a no-match is declined by the room, not the banner.
    return offered.some((move) => move.id === 'playCard') ? 'jump-in' : null;
  }
  return 'play';
}

/**
 * Pure snapshot → render model for the Wild table. `legal` must be the moves
 * the transport currently offers seat 0; while bots act it should be empty.
 */
export function wildTableView(
  snapshot: WildSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): WildTableView {
  const { session } = snapshot;
  const state = session.state;
  const isLocalTurn = session.status === 'playing' && session.phase.actor === localSeat;
  const offered = isLocalTurn ? legal : [];
  const playCards = offered.flatMap((move) =>
    move.id === 'playCard' && payloadCard(move) ? [payloadCard(move)!] : [],
  );
  // The catch window is public state, live for every seat — on turn or off.
  const playing = session.status === 'playing';
  const exposedSeat = playing ? state.catchable : null;
  const exposed =
    exposedSeat === null
      ? null
      : {
          seat: exposedSeat,
          name: snapshot.players.find((player) => player.seat === exposedSeat)?.name ?? 'them',
        };
  return {
    localSeat,
    players: snapshot.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      handCount: state.hands[player.seat]?.length ?? 0,
      isLocal: player.seat === localSeat,
      isBot: player.isBot,
      lastCardArmed: state.calledLastCard[player.seat] ?? false,
    })),
    activeSeat: session.phase.actor,
    stockCount: state.stock.length,
    discard: state.discard.slice(0, 3),
    activeColor: state.activeColor,
    direction: state.direction,
    pendingDraw: state.pendingDraw,
    phaseLabel: wildPhaseLabel(snapshot.mode, state.pendingDraw),
    hand: state.hands[localSeat] ?? [],
    decision: isLocalTurn ? localDecision(session.phase.phase, offered) : null,
    lastCardArmed: state.calledLastCard[localSeat] ?? false,
    drawnCard: state.turn === localSeat ? state.drawnCard : null,
    challenge: challengeView(snapshot, localSeat, playCards),
    catchable: exposed && exposed.seat !== localSeat ? exposed : null,
    legal: {
      playCards,
      draw: offered.some((move) => move.id === 'draw'),
      declineJump: offered.some((move) => move.id === 'declineJump'),
      chooseColor: offered.some((move) => move.id === 'chooseColor'),
      callLastCard: offered.some((move) => move.id === 'callLastCard') || exposedSeat === localSeat,
      catchLastCard: exposedSeat !== null && exposedSeat !== localSeat,
      challengeDrawFour: offered.some((move) => move.id === 'challengeDrawFour'),
      pass: offered.some((move) => move.id === 'pass'),
      swapTargets: offered.flatMap((move) =>
        move.id === 'chooseTarget' && payloadSeat(move) !== null ? [payloadSeat(move)!] : [],
      ),
    },
  };
}

/**
 * The Draw Four window, as the challenged seat sees it.
 *
 * `stackCards` is the third way out. While a pickup is pending `canPlay`
 * routes through `canStack`, so the seat's playable cards at that moment ARE
 * the stackable ones — no second rule to keep in step. Stacking adds four and
 * passes the accusation to the next seat rather than settling it.
 */
function challengeView(
  snapshot: WildSnapshot,
  localSeat: number,
  playCards: readonly string[],
): WildTableView['challenge'] {
  const open = snapshot.session.state.challenge;
  if (!open || open.challenger !== localSeat) return null;
  const accused = snapshot.players.find((player) => player.seat === open.accused);
  return {
    accused: open.accused,
    accusedName: accused?.name ?? `Seat ${open.accused}`,
    amount: open.amount,
    penalty: open.amount + CHALLENGE_PENALTY,
    stackCards: playCards,
    stackAmount: open.amount + 4,
  };
}

export type WildAnnouncementKind =
  | 'caught'
  | 'skip'
  | 'reverse'
  | 'draw-stack'
  | 'discard-all'
  | 'last-card'
  | 'swap'
  | 'rotate'
  | 'shuffle-hands'
  | 'challenge-won'
  | 'challenge-lost';

export interface WildAnnouncement {
  id: string;
  kind: WildAnnouncementKind;
  /** Headline shown center-table. */
  text: string;
  /** Supporting line — usually who it landed on. */
  detail: string | null;
  /** Seat the call is about, for the per-seat stamp. */
  seat: number | null;
  atMs: number;
}

/** Fixed order so a burst that skips *and* catches someone reads top-down. */
const ANNOUNCEMENT_ORDER: readonly WildAnnouncementKind[] = [
  'challenge-won',
  'challenge-lost',
  'reverse',
  'skip',
  'draw-stack',
  'discard-all',
  'shuffle-hands',
  'rotate',
  'swap',
  'last-card',
  'caught',
];

/**
 * Turns Wild's namespaced engine effects into table calls. Action cards used to
 * be audible only, which made a skip look like a dropped turn; every effect that
 * changes who acts next now has something to read on screen.
 */
export function wildAnnouncements(
  fx: readonly FxEvent[],
  players: readonly WildSeatView[],
): WildAnnouncement[] {
  const nameOf = (seat: number | null): string | null => {
    if (seat === null) return null;
    const player = players.find((entry) => entry.seat === seat);
    if (!player) return null;
    return player.isLocal ? 'You' : player.name;
  };

  const calls = fx.flatMap((event, index): WildAnnouncement[] => {
    const atMs = Math.max(0, event.at ?? 0);
    const seat =
      event.kind === 'wildpile.challenge'
        ? numberField(event, 'challenger')
        : numberField(event, 'seat');
    const base = { id: `${index}:${event.kind}`, atMs, seat };
    switch (event.kind) {
      case 'wildpile.skip':
        return [
          {
            ...base,
            kind: 'skip',
            text: 'Skipped',
            detail: nameOf(seat) === 'You' ? 'You lose this turn' : `${nameOf(seat)} loses a turn`,
          },
        ];
      case 'wildpile.reverse':
        return [
          {
            ...base,
            kind: 'reverse',
            seat: null,
            text: 'Reverse',
            detail: numberField(event, 'direction') === 1 ? 'Play goes left' : 'Play goes right',
          },
        ];
      case 'wildpile.draw-stack': {
        const amount = numberField(event, 'amount') ?? 0;
        return [
          { ...base, kind: 'draw-stack', seat: null, text: `+${amount}`, detail: 'Pick it up' },
        ];
      }
      case 'wildpile.discard-all': {
        const amount = numberField(event, 'amount') ?? 0;
        const color = stringField(event, 'color') ?? 'matching';
        return [
          {
            ...base,
            kind: 'discard-all',
            text: 'Drop all!',
            detail: `${nameOf(seat)} shed ${amount} ${color} card${amount === 1 ? '' : 's'}`,
          },
        ];
      }
      case 'wildpile.challenge': {
        const upheld = boolField(event, 'upheld') === true;
        const accused = numberField(event, 'accused');
        const amount = numberField(event, 'amount') ?? 0;
        const color = stringField(event, 'color');
        return [
          {
            ...base,
            kind: upheld ? 'challenge-won' : 'challenge-lost',
            // The loser wears the stamp: the accusation is about who pays.
            seat: upheld ? accused : seat,
            text: upheld ? 'Bluff called' : 'Bad call',
            detail: upheld
              ? `${nameOf(accused)} had ${color} — takes ${amount}`
              : `Nothing in ${color}. ${nameOf(seat)} takes ${amount}`,
          },
        ];
      }
      case 'wildpile.swap': {
        const target = numberField(event, 'target');
        return [
          {
            ...base,
            kind: 'swap',
            text: 'Hands swapped',
            detail: `${nameOf(seat)} took ${nameOf(target)}'s hand`,
          },
        ];
      }
      case 'wildpile.rotate':
        return [
          {
            ...base,
            kind: 'rotate',
            seat: null,
            text: 'Pass it on',
            detail:
              numberField(event, 'direction') === 1
                ? 'Every hand moves left'
                : 'Every hand moves right',
          },
        ];
      case 'wildpile.shuffle-hands':
        return [
          {
            ...base,
            kind: 'shuffle-hands',
            seat: null,
            text: 'Reshuffle',
            detail: 'New hands all round',
          },
        ];
      case 'wildpile.last-card':
        return [{ ...base, kind: 'last-card', text: 'Last card!', detail: nameOf(seat) }];
      case 'wildpile.caught': {
        const amount = numberField(event, 'amount') ?? 0;
        return [
          {
            ...base,
            kind: 'caught',
            text: 'Caught!',
            detail:
              nameOf(seat) === 'You'
                ? `No call — draw ${amount}`
                : `${nameOf(seat)} forgot to call — draws ${amount}`,
          },
        ];
      }
      default:
        return [];
    }
  });

  return calls.sort(
    (a, b) => ANNOUNCEMENT_ORDER.indexOf(a.kind) - ANNOUNCEMENT_ORDER.indexOf(b.kind),
  );
}

function boolField(event: FxEvent, field: string): boolean | null {
  const value = payloadOf(event)?.[field];
  return typeof value === 'boolean' ? value : null;
}

function stringField(event: FxEvent, field: string): string | null {
  const value = payloadOf(event)?.[field];
  return typeof value === 'string' ? value : null;
}

function payloadOf(event: FxEvent): Record<string, unknown> | null {
  if (typeof event.payload !== 'object' || event.payload === null || Array.isArray(event.payload)) {
    return null;
  }
  return event.payload as Record<string, unknown>;
}

function numberField(event: FxEvent, field: string): number | null {
  if (typeof event.payload !== 'object' || event.payload === null || Array.isArray(event.payload)) {
    return null;
  }
  const value = (event.payload as Record<string, unknown>)[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function wildPhaseLabel(mode: WildModeId, pendingDraw: number): string {
  const name = getWildMode(mode).name.toLowerCase();
  return pendingDraw > 0 ? `${name} pile · +${pendingDraw} brewing` : `${name} pile · one deal`;
}
