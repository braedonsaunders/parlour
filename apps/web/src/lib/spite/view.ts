import type { LegalMove } from '@parlour/engine';
import {
  isWildCard,
  orderSpiteHand,
  payoffRemaining,
  rankLabel,
  spiteFace,
  type SpiteState,
} from '@parlour/game-spite';
import { getSpiteMode, type SpiteModeId } from '@/lib/spite/modes';
import type { SpiteSnapshot } from '@/lib/solo/SpiteTransport';

/**
 * Everything the Spite & Malice table draws, derived once.
 *
 * The board is busier than any other on the shelf — a payoff pile, four shared
 * builds and four personal discards per seat — so the selection model is the
 * important part: pick a card up, and the view names every place it can go.
 * The screen renders that answer and never recomputes legality itself.
 */

/** Where a held card came from. Discard piles need their index. */
export type SpiteSource =
  | { kind: 'hand'; card: string }
  | { kind: 'payoff'; card: string }
  | { kind: 'discard'; card: string; pile: number };

/** Where a held card may go. */
export type SpiteTarget = { kind: 'centre'; pile: number } | { kind: 'discard'; pile: number };

export interface SpiteCardView {
  card: string;
  /** The numeral the card shows: its own rank, or the one a played wild took. */
  label: string;
  wild: boolean;
  /** For a played wild, the rank it was declared as. */
  standsFor: number | null;
}

export interface SpiteSeatView {
  seat: number;
  name: string;
  avatarId: string;
  isLocal: boolean;
  isBot: boolean;
  isTurn: boolean;
  /** Cards still to shed — the whole race, and the only score that matters. */
  payoffLeft: number;
  payoffTop: SpiteCardView | null;
  handCount: number;
  /** Top card of each personal discard pile, plus how deep it is. */
  discards: readonly { pile: number; top: SpiteCardView | null; count: number }[];
}

export interface SpiteCentreView {
  pile: number;
  top: SpiteCardView | null;
  count: number;
  /** The rank this pile will accept next; 1 on an empty pile. */
  needs: number;
  needsLabel: string;
}

export interface SpiteTableView {
  mode: SpiteModeId;
  modeName: string;
  localSeat: number;
  seats: readonly SpiteSeatView[];
  centre: readonly SpiteCentreView[];
  stockCount: number;
  /** The local seat's hand, in presentation order. */
  hand: readonly SpiteCardView[];
  isLocalTurn: boolean;
  /** Cards the local seat could pick up right now, from anywhere. */
  liftable: readonly string[];
  status: 'playing' | 'ended';
  winner: number | null;
  stageLabel: string;
}

function cardView(card: string | undefined, state: SpiteState): SpiteCardView | null {
  if (card === undefined) return null;
  const face = spiteFace(card);
  const wild = isWildCard(card);
  const declared = state.wildRanks[card];
  const standsFor = wild && typeof declared === 'number' ? declared : null;
  return {
    card,
    // A wild that has been played reads as the rank it took, because that is
    // what the pile now demands off it; one still in hand has no number at all.
    label: wild ? (standsFor === null ? '' : String(standsFor)) : face.short || face.label,
    wild,
    standsFor,
  };
}

/** Every card the local seat may pick up, derived from the legal-move list. */
function liftableCards(legal: readonly LegalMove[]): string[] {
  const out = new Set<string>();
  for (const move of legal) {
    const card = (move.payload as { card?: unknown } | undefined)?.card;
    if (typeof card === 'string') out.add(card);
  }
  return [...out];
}

export function spiteTableView(
  snapshot: SpiteSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): SpiteTableView {
  const state = snapshot.session.state;
  const mode = getSpiteMode(snapshot.mode);
  const isLocalTurn = snapshot.session.status === 'playing' && state.turn === localSeat;

  const seats: SpiteSeatView[] = snapshot.players.map((player) => ({
    seat: player.seat,
    name: player.name,
    avatarId: player.avatarId,
    isLocal: player.seat === localSeat,
    isBot: player.isBot,
    isTurn: state.turn === player.seat,
    payoffLeft: payoffRemaining(state, player.seat),
    payoffTop: cardView(state.payoffs[player.seat]?.[0], state),
    handCount: state.hands[player.seat]?.length ?? 0,
    discards: (state.discards[player.seat] ?? []).map((pile, index) => ({
      pile: index,
      top: cardView(pile[0], state),
      count: pile.length,
    })),
  }));

  const centre: SpiteCentreView[] = state.centre.map((pile, index) => ({
    pile: index,
    top: cardView(pile.cards[0], state),
    count: pile.cards.length,
    needs: pile.nextRank,
    needsLabel: rankLabel(pile.nextRank),
  }));

  const hand = orderSpiteHand(state.hands[localSeat] ?? [], {})
    .map((card) => cardView(card, state))
    .filter((card): card is SpiteCardView => card !== null);

  const leader = seats.reduce(
    (best, seat) => (best === null || seat.payoffLeft < best.payoffLeft ? seat : best),
    null as SpiteSeatView | null,
  );

  return {
    mode: snapshot.mode,
    modeName: mode.name,
    localSeat,
    seats,
    centre,
    stockCount: state.stock.length,
    hand,
    isLocalTurn,
    liftable: isLocalTurn ? liftableCards(legal) : [],
    status: snapshot.session.status === 'ended' ? 'ended' : 'playing',
    winner: state.winner,
    stageLabel:
      snapshot.session.status === 'ended'
        ? 'match over'
        : `${leader ? `${leader.name} leads · ` : ''}${
            seats.find((seat) => seat.isLocal)?.payoffLeft ?? 0
          } to shed`,
  };
}

/**
 * Where a held card may legally go.
 *
 * Derived from the same legal-move list the engine produced, so the table can
 * never offer a destination the rules would refuse — and never hide one they
 * would allow.
 */
export function targetsFor(
  legal: readonly LegalMove[],
  card: string | null,
): readonly SpiteTarget[] {
  if (card === null) return [];
  const out: SpiteTarget[] = [];
  for (const move of legal) {
    const payload = move.payload as { card?: unknown; pile?: unknown } | undefined;
    if (payload?.card !== card || typeof payload.pile !== 'number') continue;
    if (move.id === 'build') out.push({ kind: 'centre', pile: payload.pile });
    if (move.id === 'discard') out.push({ kind: 'discard', pile: payload.pile });
  }
  return out;
}

/** The move that plays `card` onto `target`, or null when there is none. */
export function moveForTarget(
  legal: readonly LegalMove[],
  card: string,
  target: SpiteTarget,
): LegalMove | null {
  const wanted = target.kind === 'centre' ? 'build' : 'discard';
  return (
    legal.find((move) => {
      const payload = move.payload as { card?: unknown; pile?: unknown } | undefined;
      return move.id === wanted && payload?.card === card && payload.pile === target.pile;
    }) ?? null
  );
}

export function isTarget(targets: readonly SpiteTarget[], target: SpiteTarget): boolean {
  return targets.some(
    (candidate) => candidate.kind === target.kind && candidate.pile === target.pile,
  );
}
