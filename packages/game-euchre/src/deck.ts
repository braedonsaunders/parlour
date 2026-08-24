import { pairedTeams, stdDeck, type CardFace, type CardId, type DeckDef } from '@parlour/engine';

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
export function trickStrength(
  card: CardId,
  trump: EuchreSuit,
  ledSuit: EuchreSuit,
): number | null {
  const nominal = suitLetterOf(card);
  if (nominal === null) return null;
  const rank = rankOf(card);
  if (rank === null) return null;
  if (nominal === trump && rank === 11) return 13;
  if (nominal === leftBowerSuit(trump) && rank === 11) return 12;
  if (effectiveSuit(card, trump) === trump) return 6 + ordinaryOrdinal(rank);
  return effectiveSuit(card, trump) === ledSuit ? ordinaryOrdinal(rank) : null;
}

/** Winner seat of a completed trick, given plays in table order. */
export function trickWinner(
  plays: readonly { seat: number; card: CardId }[],
  trump: EuchreSuit,
): number {
  if (plays.length === 0) throw new Error('trickWinner: no plays');
  const led = effectiveSuit(plays[0]!.card, trump);
  if (led === null) throw new Error('trickWinner: lead card is not a real card');
  let best = plays[0]!;
  for (const play of plays.slice(1)) {
    const challenger = trickStrength(play.card, trump, led);
    const champion = trickStrength(best.card, trump, led);
    if (challenger !== null && challenger > (champion ?? -1)) best = play;
  }
  return best.seat;
}

/** Team index of a seat at a four-seat euchre table: seats 0/2 vs 1/3. */
export function teamOf(seat: number): 0 | 1 {
  return TABLE_TEAMS.teamOf(seat) as 0 | 1;
}

export const GAME_ID = 'euchre';
