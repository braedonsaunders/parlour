import type { LegalMove } from '@parlour/engine';
import {
  MAX_SET_SIZE,
  MIN_SEATS,
  orderOf,
  roleFor,
  giftCountFor,
  type PresidentState,
} from '@parlour/game-president';
import { getPresidentMode, type PresidentModeId } from '@/lib/president/modes';
import type { PresidentPlayer, PresidentSnapshot } from '@/lib/solo/PresidentTransport';

export type PresidentDecision = 'lead-or-follow' | 'pass-only' | 'give' | 'return';

export interface PresidentSeatView extends PresidentPlayer {
  handCount: number;
  score: number;
  isLocal: boolean;
  /** role from the previous deal's finish order — null before any deal completed */
  role: string | null;
}

export interface PileSetView {
  seat: number;
  cards: readonly string[];
  rank: number;
}

export interface PresidentTableView {
  players: readonly PresidentSeatView[];
  localSeat: number;
  activeSeat: number | null;
  dealNumber: number;
  phaseLabel: string;
  mode: PresidentModeId;
  targetPoints: number;
  /** current trick, oldest first */
  pile: readonly PileSetView[];
  standing: PileSetView | null;
  hand: readonly string[];
  decision: PresidentDecision | null;
  /** exchange sizes for the local seat this transition */
  giveCount: number;
  returnCount: number;
  legal: {
    /** cards that can participate in some legal set right now */
    playableCards: readonly string[];
    pass: boolean;
    give: boolean;
    returnCards: boolean;
  };
  finishedOrder: readonly number[];
}

function pileSets(state: PresidentState): PileSetView[] {
  const sets: PileSetView[] = [];
  let cursor = 0;
  while (cursor < state.pile.length) {
    const rank = orderOf(state.pile[cursor]!);
    let end = cursor;
    while (end < state.pile.length && orderOf(state.pile[end]!) === rank) end++;
    sets.push({
      seat: -1, // historical sets lose their author once beaten; the UI shows ranks
      cards: state.pile.slice(cursor, end),
      rank,
    });
    cursor = end;
  }
  return sets;
}

/**
 * Pure snapshot → render model for the President table. `legal` must be the
 * moves the transport currently offers the local seat; while others act it
 * should be empty.
 */
export function presidentTableView(
  snapshot: PresidentSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): PresidentTableView {
  const { session } = snapshot;
  const state = session.state;
  const isLocalTurn =
    session.status === 'playing' &&
    (session.phase.actor === localSeat || (session.phase.actors ?? []).includes(localSeat));
  const offered = isLocalTurn ? legal : [];

  const hasGive = offered.some((move) => move.id === 'giveCards');
  const hasReturn = offered.some((move) => move.id === 'returnCards');
  const setMoves = offered.filter((move) => move.id === 'playSet');

  // A card is playable when some enumerated set contains it.
  const playable = new Set<string>();
  for (const move of setMoves) {
    const raw = (move.payload as { cards?: readonly string[] } | undefined)?.cards;
    if (Array.isArray(raw)) for (const card of raw) playable.add(card);
  }

  const order = state.lastOrder;
  const players = snapshot.players.map((player) => ({
    ...player,
    handCount: state.hands[player.seat]?.length ?? 0,
    score: state.score[player.seat] ?? 0,
    isLocal: player.seat === localSeat,
    role: order ? (roleFor(order, player.seat) ?? null) : null,
  }));

  const giveCount = hasGive ? giftCountFor(roleFor(order ?? [], localSeat) ?? 'neutral') : 0;
  const returnCount = hasReturn ? (state.awaitingReturn?.count ?? 0) : 0;

  const decision: PresidentDecision | null = !isLocalTurn
    ? null
    : hasGive
      ? 'give'
      : hasReturn
        ? 'return'
        : state.turn === localSeat
          ? 'lead-or-follow'
          : null;

  const standingView: PileSetView | null = state.standing
    ? {
        seat: state.standing.seat,
        cards: state.standing.cards,
        rank: state.standing.rank,
      }
    : null;

  const modeName = getPresidentMode(snapshot.mode).name.toLowerCase();
  let phaseLabel = `${modeName} table · deal ${state.deal + 1}`;
  if (session.status !== 'playing') phaseLabel = `${modeName} · final standings`;
  else if (decision === 'give' || decision === 'return') phaseLabel = `${modeName} · the exchange`;
  else if (standingView) phaseLabel = `${modeName} · beat rank ${standingView.rank}`;

  return {
    players,
    localSeat,
    activeSeat: session.phase.actor,
    dealNumber: state.deal + 1,
    phaseLabel,
    mode: snapshot.mode,
    targetPoints: state.rules.targetPoints,
    pile: pileSets(state),
    standing: standingView,
    hand: state.hands[localSeat] ?? [],
    decision,
    giveCount,
    returnCount,
    legal: {
      playableCards: [...playable],
      pass: offered.some((move) => move.id === 'pass'),
      give: hasGive,
      returnCards: hasReturn,
    },
    finishedOrder: state.finished,
  };
}

/** Client-side check for a hand-picked set before sending it to the engine. */
export function isValidLocalSet(
  view: Pick<PresidentTableView, 'hand' | 'standing'>,
  cards: readonly string[],
): boolean {
  if (cards.length < 1 || cards.length > MAX_SET_SIZE) return false;
  const seen = new Set(cards);
  if (seen.size !== cards.length) return false;
  if (!cards.every((card) => view.hand.includes(card))) return false;
  if (!cards.every((card) => orderOf(card) === orderOf(cards[0]!))) return false;
  if (view.standing) {
    if (cards.length !== view.standing.cards.length) return false;
    return orderOf(cards[0]!) > view.standing.rank;
  }
  return true;
}

export function minPresidentSeats(): number {
  return MIN_SEATS;
}
