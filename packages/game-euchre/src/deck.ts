import {
  pairedTeams,
  stableCardOrder,
  stdDeck,
  type CardFace,
  type CardId,
  type DeckDef,
  type HandOrder,
} from '@parlour/engine';
import { openTrick, playToTrick, resolveTrickWinner, type TrickRules } from '@parlour/tricks';

/** The neutral partnership map for a four-seat euchre table: 0/2 vs 1/3. */
const TABLE_TEAMS = pairedTeams(4);

/** Euchre suits by deck-id letter (stdDeck ids: `H11` = J♥). */
export const EUCHRE_SUITS = ['S', 'H', 'D', 'C'] as const;
export type EuchreSuit = (typeof EUCHRE_SUITS)[number];

export const EUCHRE_SUIT_NAMES: Record<EuchreSuit, string> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};

const SUIT_OF_LETTER: Record<string, EuchreSuit> = {
  S: 'S',
  H: 'H',
  D: 'D',
  C: 'C',
};

/** The 24-card euchre deck: 9s up through aces. */
export function euchreDeck(): DeckDef {
  const full = stdDeck();
  // std-deck ids carry ace as rank 1 (S1), faces J/Q/K as 11/12/13
  const cardIds = full.cardIds.filter((id) => {
    const rank = rankOf(id) ?? 0;
    return rank === 1 || rank >= 9;
  });
  const faces: Record<CardId, CardFace> = {};
  for (const id of cardIds) {
    const face = full.faces[id];
    if (face) faces[id] = face;
  }
  return { id: 'euchre-24', cardIds, faces };
}

export const DECK_SIZE = 24;
export const HAND_SIZE = 5;
export const KITTY_SIZE = 4;

/** Rank of a std-deck card id (A=1 … J=11, Q=12, K=13), or null for non-cards. */
export function rankOf(card: CardId): number | null {
  const rank = Number.parseInt(card.slice(1), 10);
  return Number.isInteger(rank) && rank >= 1 && rank <= 13 ? rank : null;
}

/** Nominal suit letter of a card id, tolerant of veil handles and junk. */
export function suitLetterOf(card: CardId): EuchreSuit | null {
  return SUIT_OF_LETTER[card[0] ?? ''] ?? null;
}

const SAME_COLOR: Record<EuchreSuit, EuchreSuit> = { S: 'C', C: 'S', H: 'D', D: 'H' };

/** The suit whose jack becomes the left bower when `trump` is named. */
export function leftBowerSuit(trump: EuchreSuit): EuchreSuit {
  return SAME_COLOR[trump];
}

export function isRightBower(card: CardId, trump: EuchreSuit): boolean {
  return suitLetterOf(card) === trump && rankOf(card) === 11;
}

export function isLeftBower(card: CardId, trump: EuchreSuit): boolean {
  return suitLetterOf(card) === leftBowerSuit(trump) && rankOf(card) === 11;
}

/**
 * The suit a card actually belongs to once trump is named — the left bower
 * counts as trump for following AND winning (the heart of euchre rules).
 * Returns null for anything that is not a real card.
 */
export function effectiveSuit(card: CardId, trump: EuchreSuit): EuchreSuit | null {
  if (isLeftBower(card, trump)) return trump;
  return suitLetterOf(card);
}

/** Relative ordering 9 < 10 < J < Q < K < A within an ordinary suit. */
function ordinaryOrdinal(rank: number): number {
  return rank === 1 ? 5 : rank >= 9 ? rank - 9 : -1;
}

/**
 * Strength of a card inside the trick it competes for:
 * right bower > left bower > A > K > Q > 10 > 9 of trump, then led-suit cards.
 * Null means "cannot win this trick" (off-suit throw-in).
 */
export function trickStrength(card: CardId, trump: EuchreSuit, ledSuit: EuchreSuit): number | null {
  const nominal = suitLetterOf(card);
  if (nominal === null) return null;
  const rank = rankOf(card);
  if (rank === null) return null;
  if (nominal === trump && rank === 11) return 13;
  if (nominal === leftBowerSuit(trump) && rank === 11) return 12;
  if (effectiveSuit(card, trump) === trump) return 6 + ordinaryOrdinal(rank);
  return effectiveSuit(card, trump) === ledSuit ? ordinaryOrdinal(rank) : null;
}

/**
 * Rank used when two cards compete inside the SAME effective suit.
 *
 * `resolveTrickWinner` only ever compares ranks within one suit, so the bowers
 * just need to sit above ordinary trump: right bower > left bower > A > K > Q >
 * 10 > 9. Trump-beats-led is the resolver's job, not this function's — which is
 * why there is no `+6` offset here and there is one in `trickStrength`.
 */
function trickRank(card: CardId, trump: EuchreSuit): number {
  const nominal = suitLetterOf(card);
  const rank = rankOf(card);
  if (nominal === null || rank === null) return -Infinity;
  if (nominal === trump && rank === 11) return 13;
  if (nominal === leftBowerSuit(trump) && rank === 11) return 12;
  return ordinaryOrdinal(rank);
}

/**
 * Euchre as a `@parlour/tricks` rule set. The left bower is exactly the case
 * that package's `effectiveSuit` hook exists for, so trick resolution is the
 * shared implementation rather than a euchre-private copy of it.
 */
export function euchreTrickRules(trump: EuchreSuit): TrickRules {
  return {
    suitOf: (card) => suitLetterOf(card),
    effectiveSuit: (card) => effectiveSuit(card, trump),
    rankOf: (card) => trickRank(card, trump),
    trumpSuit: trump,
  };
}

/** Winner seat of a completed trick, given plays in table order. */
export function trickWinner(
  plays: readonly { seat: number; card: CardId }[],
  trump: EuchreSuit,
): number {
  if (plays.length === 0) throw new Error('trickWinner: no plays');
  const rules = euchreTrickRules(trump);
  if (effectiveSuit(plays[0]!.card, trump) === null) {
    throw new Error('trickWinner: lead card is not a real card');
  }
  let trick = openTrick(plays[0]!.seat);
  for (const play of plays) trick = playToTrick(trick, play.seat, play.card, rules);
  const winner = resolveTrickWinner(trick, rules);
  if (winner === null) throw new Error('trickWinner: no play could win the trick');
  return winner;
}

/** Team index of a seat at a four-seat euchre table: seats 0/2 vs 1/3. */
export function teamOf(seat: number): 0 | 1 {
  return TABLE_TEAMS.teamOf(seat) as 0 | 1;
}

/**
 * Keeps suits together while bidding; after trump is named, the left bower
 * joins the trump block and both bowers sit at its strong end.
 */
export const orderEuchreHand: HandOrder = (cards, context) => {
  const rawTrump = context.trump;
  const trump = EUCHRE_SUITS.includes(rawTrump as EuchreSuit) ? (rawTrump as EuchreSuit) : null;
  const suitOrder = trump
    ? [...EUCHRE_SUITS.filter((suit) => suit !== trump), trump]
    : [...EUCHRE_SUITS];
  const suitPosition = new Map(suitOrder.map((suit, index) => [suit, index]));

  return stableCardOrder(cards, (left, right) => {
    const aRank = rankOf(left);
    const bRank = rankOf(right);
    const aSuit = trump ? effectiveSuit(left, trump) : suitLetterOf(left);
    const bSuit = trump ? effectiveSuit(right, trump) : suitLetterOf(right);
    if (aRank === null || aSuit === null) return bRank === null || bSuit === null ? 0 : 1;
    if (bRank === null || bSuit === null) return -1;
    const suitDiff = (suitPosition.get(aSuit) ?? 99) - (suitPosition.get(bSuit) ?? 99);
    if (suitDiff !== 0) return suitDiff;
    const aStrength =
      trump && aSuit === trump ? trickStrength(left, trump, trump) : ordinaryOrdinal(aRank);
    const bStrength =
      trump && bSuit === trump ? trickStrength(right, trump, trump) : ordinaryOrdinal(bRank);
    return (aStrength ?? -1) - (bStrength ?? -1) || left.localeCompare(right);
  });
};

export const GAME_ID = 'euchre';
