import type { FxEvent, LegalMove } from '@parlour/engine';
import {
  EIGHTS_SUIT_GLYPHS,
  EIGHTS_SUIT_NAMES,
  type EightsRoundReason,
  type EightsSuit,
} from '@parlour/game-eights';
import { getEightsMode, type EightsModeId } from '@/lib/eights/modes';
import type { EightsSnapshot } from '@/lib/solo/EightsTransport';

export type EightsDecision = 'play' | 'choose-suit' | 'round-end';

export interface EightsSeatView {
  seat: number;
  name: string;
  avatarId: string;
  handCount: number;
  isLocal: boolean;
  isBot: boolean;
  score: number;
  roundsWon: number;
  dealer: boolean;
}

export interface EightsRoundEndView {
  reason: EightsRoundReason;
  winner: number;
  winnerName: string;
  points: number;
  /** Per seat, in seat order, as the round closed. */
  handValues: readonly number[];
  handCounts: readonly number[];
  /** Seats that have not yet asked for the next deal. */
  waitingFor: readonly number[];
}

export interface EightsTableView {
  players: readonly EightsSeatView[];
  localSeat: number;
  activeSeat: number | null;
  roundNumber: number;
  targetScore: number;
  stockCount: number;
  /** Top-first, capped for the pile display. */
  discard: readonly string[];
  activeSuit: EightsSuit;
  direction: 1 | -1;
  pendingDraw: number;
  phaseLabel: string;
  hand: readonly string[];
  /** Card the local seat just drew and may still play, if any. */
  drawnCard: string | null;
  /** The local seat's pending decision, or null while others act. */
  decision: EightsDecision | null;
  legal: {
    playCards: readonly string[];
    draw: boolean;
    pass: boolean;
    chooseSuit: boolean;
    ready: boolean;
  };
  roundEnd: EightsRoundEndView | null;
  matchOver: boolean;
}

export const SUIT_GLYPH = EIGHTS_SUIT_GLYPHS;
export const SUIT_NAME = EIGHTS_SUIT_NAMES;

function payloadCard(move: LegalMove): string | null {
  const card = (move.payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' ? card : null;
}

function decisionFor(phase: string): EightsDecision {
  if (phase === 'choose-suit') return 'choose-suit';
  if (phase === 'round-end') return 'round-end';
  return 'play';
}

/**
 * Pure snapshot → render model for the Crazy Eights table. `legal` must be the
 * moves the transport currently offers `localSeat`; while others act it should
 * be empty.
 */
export function eightsTableView(
  snapshot: EightsSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): EightsTableView {
  const { session } = snapshot;
  const state = session.state;
  const { round } = state;
  const acting =
    session.status === 'playing' &&
    ((session.phase.actors ?? []).includes(localSeat) || session.phase.actor === localSeat);
  const offered = acting ? legal : [];

  const players: EightsSeatView[] = snapshot.players.map((player) => ({
    seat: player.seat,
    name: player.name,
    avatarId: player.avatarId,
    handCount: round.hands[player.seat]?.length ?? 0,
    isLocal: player.seat === localSeat,
    isBot: player.isBot,
    score: state.scores[player.seat] ?? 0,
    roundsWon: state.roundsWon[player.seat] ?? 0,
    dealer: state.dealer === player.seat,
  }));

  return {
    players,
    localSeat,
    activeSeat: session.phase.actor,
    roundNumber: state.roundIndex + 1,
    targetScore: state.rules.targetScore,
    stockCount: round.stock.length,
    discard: round.discard.slice(0, 3),
    activeSuit: round.activeSuit,
    direction: round.direction,
    pendingDraw: round.pendingDraw,
    phaseLabel: phaseLabel(snapshot.mode, state.roundIndex + 1, round.pendingDraw, state.folded),
    hand: round.hands[localSeat] ?? [],
    drawnCard: round.turn === localSeat ? round.drawnCard : null,
    decision: acting ? decisionFor(session.phase.phase) : null,
    legal: {
      playCards: offered.flatMap((move) => {
        const card = move.id === 'playCard' ? payloadCard(move) : null;
        return card ? [card] : [];
      }),
      draw: offered.some((move) => move.id === 'draw'),
      pass: offered.some((move) => move.id === 'pass'),
      chooseSuit: offered.some((move) => move.id === 'chooseSuit'),
      ready: offered.some((move) => move.id === 'ready'),
    },
    roundEnd: roundEndView(snapshot, players),
    matchOver: session.status === 'ended' || snapshot.matchWinner !== null,
  };
}

function roundEndView(
  snapshot: EightsSnapshot,
  players: readonly EightsSeatView[],
): EightsRoundEndView | null {
  const state = snapshot.session.state;
  if (!state.folded || !state.lastOutcome) return null;
  const outcome = state.lastOutcome;
  const winner = players.find((player) => player.seat === outcome.winner);
  const waitingFor = players
    .map((player) => player.seat)
    .filter((seat) => !state.readied.includes(seat));
  return {
    reason: outcome.reason,
    winner: outcome.winner,
    // "Bea went out" reads like someone else did it when Bea is you.
    winnerName: winner?.isLocal ? 'You' : (winner?.name ?? 'The table'),
    points: outcome.points,
    handValues: outcome.handValues,
    handCounts: outcome.handCounts,
    waitingFor,
  };
}

function phaseLabel(
  mode: EightsModeId,
  roundNumber: number,
  pendingDraw: number,
  folded: boolean,
): string {
  const name = getEightsMode(mode).name.toLowerCase();
  if (folded) return `${name} · round ${roundNumber} scored`;
  if (pendingDraw > 0) return `${name} · +${pendingDraw} riding on it`;
  return `${name} · round ${roundNumber}`;
}

// ---------------------------------------------------------------------------
// centre-table calls
// ---------------------------------------------------------------------------

export type EightsAnnouncementKind = 'skip' | 'reverse' | 'draw-stack' | 'suit' | 'blocked' | 'out';

export interface EightsAnnouncement {
  id: string;
  kind: EightsAnnouncementKind;
  /** Headline shown centre-table. */
  text: string;
  /** Supporting line — usually who it landed on. */
  detail: string | null;
  /** Seat the call is about, for the per-seat stamp. */
  seat: number | null;
  atMs: number;
}

/** Fixed order so a burst that skips *and* stacks reads top-down. */
const ANNOUNCEMENT_ORDER: readonly EightsAnnouncementKind[] = [
  'out',
  'blocked',
  'reverse',
  'skip',
  'draw-stack',
  'suit',
];

/**
 * Turns the pack's namespaced effects into table calls. An action card that
 * only made a sound looked like a dropped turn; everything that changes who
 * plays next now has something to read.
 */
export function eightsAnnouncements(
  fx: readonly FxEvent[],
  players: readonly EightsSeatView[],
): EightsAnnouncement[] {
  const nameOf = (seat: number | null): string | null => {
    if (seat === null) return null;
    const player = players.find((entry) => entry.seat === seat);
    if (!player) return null;
    return player.isLocal ? 'You' : player.name;
  };

  const calls = fx.flatMap((event, index): EightsAnnouncement[] => {
    const atMs = Math.max(0, event.at ?? 0);
    const seat = numberField(event, 'seat');
    const base = { id: `${index}:${event.kind}`, atMs, seat };
    switch (event.kind) {
      case 'eights.skip':
        return [
          {
            ...base,
            kind: 'skip',
            text: 'Skipped',
            detail: nameOf(seat) === 'You' ? 'You lose this turn' : `${nameOf(seat)} loses a turn`,
          },
        ];
      case 'eights.reverse':
        return [
          {
            ...base,
            kind: 'reverse',
            seat: null,
            text: 'Reverse',
            detail: numberField(event, 'direction') === 1 ? 'Play goes left' : 'Play goes right',
          },
        ];
      case 'eights.draw-stack': {
        const amount = numberField(event, 'amount') ?? 0;
        return [
          { ...base, kind: 'draw-stack', seat: null, text: `+${amount}`, detail: 'Pick it up' },
        ];
      }
      case 'eights.suit': {
        const suit = stringField(event, 'suit');
        if (!suit || !(suit in SUIT_NAME)) return [];
        const named = suit as EightsSuit;
        return [
          {
            ...base,
            kind: 'suit',
            seat: null,
            text: SUIT_GLYPH[named],
            detail: `${nameOf(seat) ?? 'The table'} called ${SUIT_NAME[named]}`,
          },
        ];
      }
      case 'eights.out':
        return [
          {
            ...base,
            kind: 'out',
            text: 'Out!',
            detail: `${nameOf(seat)} shed the lot`,
          },
        ];
      case 'eights.blocked':
        return [
          {
            ...base,
            kind: 'blocked',
            text: 'Blocked',
            detail: `Nothing left to play — ${nameOf(seat)} was lightest`,
          },
        ];
      default:
        return [];
    }
  });

  return calls.sort(
    (a, b) => ANNOUNCEMENT_ORDER.indexOf(a.kind) - ANNOUNCEMENT_ORDER.indexOf(b.kind),
  );
}

function payloadOf(event: FxEvent): Record<string, unknown> | null {
  if (typeof event.payload !== 'object' || event.payload === null || Array.isArray(event.payload)) {
    return null;
  }
  return event.payload as Record<string, unknown>;
}

function numberField(event: FxEvent, field: string): number | null {
  const value = payloadOf(event)?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringField(event: FxEvent, field: string): string | null {
  const value = payloadOf(event)?.[field];
  return typeof value === 'string' ? value : null;
}
