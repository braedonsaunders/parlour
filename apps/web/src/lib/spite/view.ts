import type { GameSession, LegalMove } from '@parlour/engine';
import type { SpiteRules, SpiteState } from '@parlour/game-spite';
import type { SpiteModeId } from '@/lib/spite/modes';

export interface SpiteSeatView {
  seat: number;
  name: string;
  avatarId: string;
  isLocal: boolean;
  isBot: boolean;
  isTurn: boolean;
  handCount: number;
  /** cards left on the payoff pile — the race is to empty this */
  payoffLeft: number;
  /** the face-up card on top of the payoff pile, or null when it is empty */
  payoffTop: string | null;
  /** top card of each personal discard pile, null where the pile is empty */
  discardTops: readonly (string | null)[];
  discardCounts: readonly number[];
}

export interface SpiteCentreView {
  index: number;
  /** the card showing, or null on an empty build */
  top: string | null;
  /** the rank this pile will accept next; 1 is an ace on an empty pile */
  nextRank: number;
  count: number;
}

/** One legal build: this card onto that centre pile. */
export interface SpiteBuildOption {
  card: string;
  pile: number;
  rank: number;
}

/** One legal discard: this card onto that personal pile. */
export interface SpiteDiscardOption {
  card: string;
  pile: number;
}

export interface SpiteTableView {
  players: readonly SpiteSeatView[];
  localSeat: number;
  activeSeat: number | null;
  centre: readonly SpiteCentreView[];
  stockCount: number;
  hand: readonly string[];
  builds: readonly SpiteBuildOption[];
  discards: readonly SpiteDiscardOption[];
  /** every card the local seat could move right now, from any source */
  movableCards: readonly string[];
  yourTurn: boolean;
  /** true when the only thing left to do is end the turn with a discard */
  mustDiscard: boolean;
  matchOver: boolean;
  won: boolean | null;
  winner: number | null;
  mode: SpiteModeId;
  rules: SpiteRules;
}

export interface SpiteSnapshot {
  mode: SpiteModeId;
  players: readonly { seat: number; name: string; avatarId: string; isBot: boolean }[];
  session: GameSession<SpiteState, SpiteRules>;
  won: boolean | null;
}

function payloadOf(move: LegalMove): Record<string, unknown> {
  return (move.payload as Record<string, unknown> | undefined) ?? {};
}

/** Rank as it reads on a card: 1 is an ace, 12 a queen. */
export function rankLabel(rank: number): string {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 10) return '10';
  return String(rank);
}

export function buildsForCard(
  builds: readonly SpiteBuildOption[],
  card: string,
): SpiteBuildOption[] {
  return builds.filter((option) => option.card === card);
}

export function discardsForCard(
  discards: readonly SpiteDiscardOption[],
  card: string,
): SpiteDiscardOption[] {
  return discards.filter((option) => option.card === card);
}

/**
 * Pure snapshot → render model for the Spite & Malice table. `legal` must be
 * the moves offered to the viewing seat; pass [] while others act.
 */
export function spiteTableView(
  snapshot: SpiteSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): SpiteTableView {
  const session = snapshot.session;
  const state = session.state;
  const playing = session.status === 'playing';
  const yourTurn = playing && state.turn === localSeat;
  const offered = yourTurn ? legal : [];

  const builds: SpiteBuildOption[] = offered
    .filter((move) => move.id === 'build')
    .map((move) => {
      const payload = payloadOf(move);
      return {
        card: String(payload.card ?? ''),
        pile: Number(payload.pile ?? 0),
        rank: Number(payload.rank ?? 0),
      };
    })
    .filter((option) => option.card.length > 0);

  const discards: SpiteDiscardOption[] = offered
    .filter((move) => move.id === 'discard')
    .map((move) => {
      const payload = payloadOf(move);
      return { card: String(payload.card ?? ''), pile: Number(payload.pile ?? 0) };
    })
    .filter((option) => option.card.length > 0);

  const players: SpiteSeatView[] = snapshot.players.map((player) => {
    const seat = player.seat;
    const payoff = state.payoffs[seat] ?? [];
    const piles = state.discards[seat] ?? [];
    return {
      seat,
      name: player.name,
      avatarId: player.avatarId,
      isLocal: seat === localSeat,
      isBot: player.isBot,
      isTurn: playing && state.turn === seat,
      handCount: (state.hands[seat] ?? []).length,
      payoffLeft: payoff.length,
      // Index 0 is the top, and it is the one card of the pile anyone can see.
      payoffTop: payoff[0] === undefined || payoff[0] === '??' ? null : payoff[0],
      discardTops: piles.map((pile) => pile[0] ?? null),
      discardCounts: piles.map((pile) => pile.length),
    };
  });

  return {
    players,
    localSeat,
    activeSeat: playing ? state.turn : null,
    centre: state.centre.map((pile, index) => ({
      index,
      top: pile.cards[0] ?? null,
      nextRank: pile.nextRank,
      count: pile.cards.length,
    })),
    stockCount: state.stock.length,
    hand: (state.hands[localSeat] ?? []).filter((card) => card !== '??'),
    builds,
    discards,
    movableCards: [...new Set([...builds, ...discards].map((option) => option.card))],
    yourTurn,
    mustDiscard: yourTurn && builds.length === 0 && discards.length > 0,
    matchOver: session.status !== 'playing',
    won: snapshot.won,
    winner: state.winner,
    mode: snapshot.mode,
    rules: state.rules,
  };
}
