import {
  isVeilHandle,
  stableCardOrder,
  type CardId,
  type DeckDef,
  type HandOrder,
  type HandOrderContext,
} from '@parlour/engine';

/** Suit letters, matching every other parlour pack's convention. */
export const DURAK_SUITS = ['S', 'H', 'D', 'C'] as const;

export type DurakSuit = (typeof DURAK_SUITS)[number];

export const DURAK_SUIT_NAMES: Readonly<Record<DurakSuit, string>> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};

export const DURAK_SUIT_GLYPHS: Readonly<Record<DurakSuit, string>> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

/** Ranks 6–14: six through ten, then jack (11), queen (12), king (13), ace (14). */
export const DURAK_MIN_RANK = 6;
export const DURAK_MAX_RANK = 14;

const RANK_SHORT: Readonly<Record<number, string>> = {
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

function buildDeck(): DeckDef {
  const cardIds: CardId[] = [];
  const faces: Record<
    CardId,
    { label: string; short: string; suit: string; rank: number; color: string }
  > = {};
  for (const suit of DURAK_SUITS) {
    for (let rank = DURAK_MIN_RANK; rank <= DURAK_MAX_RANK; rank++) {
      const id = `${suit}${rank}`;
      cardIds.push(id);
      faces[id] = {
        label: `${RANK_SHORT[rank]}${DURAK_SUIT_GLYPHS[suit]}`,
        short: RANK_SHORT[rank] as string,
        suit: DURAK_SUIT_NAMES[suit],
        rank,
        color: suit === 'H' || suit === 'D' ? 'red' : 'black',
      };
    }
  }
  return { id: 'durak-36', cardIds, faces };
}

/** Durak is played from a shortened 36-card pack: 6 through ace in every suit. */
export const durakDeck: DeckDef = buildDeck();

export function isDurakCard(card: CardId): boolean {
  return Object.hasOwn(durakDeck.faces, card);
}

/**
 * A card the table is holding but cannot read — a handle under Veil. Every
 * reader below (suit, rank, comparisons) defers to this instead of throwing.
 */
export function isHiddenCard(card: CardId): boolean {
  return isVeilHandle(card);
}

export function hasHiddenCard(cards: readonly CardId[]): boolean {
  return cards.some(isHiddenCard);
}

export function isDurakSuit(value: unknown): value is DurakSuit {
  return DURAK_SUITS.includes(value as DurakSuit);
}

export function suitOf(card: CardId): DurakSuit {
  const suit = card.slice(0, 1);
  if (!isDurakSuit(suit)) throw new Error(`unknown durak card: ${card}`);
  return suit;
}

export function rankOf(card: CardId): number {
  const rank = Number.parseInt(card.slice(1), 10);
  if (!Number.isInteger(rank) || rank < DURAK_MIN_RANK || rank > DURAK_MAX_RANK) {
    throw new Error(`unknown durak card: ${card}`);
  }
  return rank;
}

export function rankShort(card: CardId): string {
  return RANK_SHORT[rankOf(card)] ?? String(rankOf(card));
}

/**
 * The core comparator: does `defend` beat `attack` under this trump suit?
 *
 * Same suit wins on rank alone. A trump beats any non-trump attack. Two cards
 * of different, non-trump suits never beat one another — that is what makes
 * an off-suit attack unanswerable except with a trump.
 */
export function beats(attack: CardId, defend: CardId, trumpSuit: DurakSuit): boolean {
  const attackSuit = suitOf(attack);
  const defendSuit = suitOf(defend);
  if (attackSuit === defendSuit) return rankOf(defend) > rankOf(attack);
  return defendSuit === trumpSuit && attackSuit !== trumpSuit;
}

/**
 * Suits stay in blocks, low to high rank within each — with the trump suit
 * pushed to the end of the hand, since it is the suit worth saving.
 */
export const orderDurakHand: HandOrder = (cards: readonly CardId[], context: HandOrderContext) => {
  const rawTrump = context.trump;
  const trump = isDurakSuit(rawTrump) ? rawTrump : null;
  const suitOrder = trump
    ? [...DURAK_SUITS.filter((suit) => suit !== trump), trump]
    : [...DURAK_SUITS];
  const suitPosition = new Map(suitOrder.map((suit, index) => [suit, index]));

  return stableCardOrder(cards, (left, right) => {
    const leftHidden = isHiddenCard(left);
    const rightHidden = isHiddenCard(right);
    if (leftHidden || rightHidden) return Number(leftHidden) - Number(rightHidden);
    const suitDiff =
      (suitPosition.get(suitOf(left)) ?? 99) - (suitPosition.get(suitOf(right)) ?? 99);
    if (suitDiff !== 0) return suitDiff;
    return rankOf(left) - rankOf(right);
  });
};
