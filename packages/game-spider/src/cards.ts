import {
  keepHandOrder,
  type CardFace,
  type CardId,
  type DeckDef,
  type HandOrder,
} from '@parlour/engine';

export const SPIDER_SEATS = 1;
export const TABLEAU_COLUMNS = 10;
export const FOUNDATION_SLOTS = 8;
export const FOUNDATION_SIZE = 13;
export const STOCK_DEAL = 10;
export const TOTAL_CARDS = 104;

/** Columns 0–3 hold 6 cards; 4–9 hold 5. */
export const COLUMN_LENGTHS = [6, 6, 6, 6, 5, 5, 5, 5, 5, 5] as const;

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export type SpiderSuit = (typeof SUITS)[number];
export type SpiderSuitCount = 1 | 2 | 4;

type SuitLetter = 'S' | 'H' | 'D' | 'C';

const SUIT_BY_LETTER: Record<SuitLetter, SpiderSuit> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};

const LETTER_BY_SUIT: Record<SpiderSuit, SuitLetter> = {
  spades: 'S',
  hearts: 'H',
  diamonds: 'D',
  clubs: 'C',
};

const RANK_SHORT = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const RANK_NAMES = [
  '',
  'Ace',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'Jack',
  'Queen',
  'King',
] as const;

const COPIES: Record<SpiderSuitCount, readonly string[]> = {
  1: ['', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  2: ['', 'b', 'c', 'd'],
  4: ['', 'b'],
};

const SUITS_FOR: Record<SpiderSuitCount, readonly SuitLetter[]> = {
  1: ['S'],
  2: ['S', 'H'],
  4: ['S', 'H', 'D', 'C'],
};

function faceFor(letter: SuitLetter, rank: number, suffix: string): CardFace {
  const suit = SUIT_BY_LETTER[letter];
  const short = RANK_SHORT[rank] ?? String(rank);
  return {
    label: `${short}${letter}${suffix}`,
    short,
    suit,
    rank,
    color: letter === 'H' || letter === 'D' ? 'red' : 'black',
  };
}

const FACE_CACHE = new Map<CardId, CardFace>();

function rememberFace(id: CardId, face: CardFace): CardFace {
  FACE_CACHE.set(id, face);
  return face;
}

/** Custom two-deck Spider stock. Never uses `stdDeck()` as the playing deck. */
export function deckFor(suitCount: SpiderSuitCount): DeckDef {
  const copies = COPIES[suitCount];
  const letters = SUITS_FOR[suitCount];
  const cardIds: CardId[] = [];
  const faces: Record<CardId, CardFace> = {};
  for (const letter of letters) {
    for (let rank = 1; rank <= 13; rank++) {
      for (const suffix of copies) {
        const id = `${letter}${rank}${suffix}`;
        cardIds.push(id);
        faces[id] = rememberFace(id, faceFor(letter, rank, suffix));
      }
    }
  }
  return { id: `spider-${suitCount}suit`, cardIds, faces };
}

function faceOf(card: CardId): CardFace | undefined {
  const cached = FACE_CACHE.get(card);
  if (cached) return cached;
  const letter = card[0];
  const rank = Number.parseInt(card.slice(1), 10);
  if (!letter || !(letter in SUIT_BY_LETTER) || !Number.isInteger(rank) || rank < 1 || rank > 13) {
    return undefined;
  }
  const suffix = card.slice(1 + String(rank).length);
  return rememberFace(card, faceFor(letter as SuitLetter, rank, suffix));
}

export function suitOfCard(card: CardId): SpiderSuit | null {
  const suit = faceOf(card)?.suit;
  return SUITS.includes(suit as SpiderSuit) ? (suit as SpiderSuit) : null;
}

/** Printed rank: Ace=1 through King=13. `S13b` and `S1h` parse the same as `S13` / `S1`. */
export function rankOfCard(card: CardId): number {
  const rank = faceOf(card)?.rank;
  return typeof rank === 'number' ? rank : -1;
}

export function colorOfCard(card: CardId): 'red' | 'black' | null {
  const color = faceOf(card)?.color;
  return color === 'red' || color === 'black' ? color : null;
}

export function isKing(card: CardId): boolean {
  return rankOfCard(card) === 13;
}

export function isAce(card: CardId): boolean {
  return rankOfCard(card) === 1;
}

/** Spoken face, e.g. "King of spades". Unknown ids stay as the raw card. */
export function nameOfCard(card: CardId): string {
  const rank = rankOfCard(card);
  const suit = suitOfCard(card);
  const rankName = rank >= 1 && rank <= 13 ? RANK_NAMES[rank] : null;
  return rankName && suit ? `${rankName} of ${suit}` : card;
}

export function letterOfSuit(suit: SpiderSuit): SuitLetter {
  return LETTER_BY_SUIT[suit];
}

/** Same-suit packed descending run — the only unit that may move together. */
export function isPackedRun(cards: readonly CardId[]): boolean {
  if (cards.length === 0) return false;
  for (let index = 1; index < cards.length; index++) {
    const above = cards[index - 1] as CardId;
    const below = cards[index] as CardId;
    if (rankOfCard(below) !== rankOfCard(above) - 1) return false;
    if (suitOfCard(below) !== suitOfCard(above)) return false;
  }
  return true;
}

/** Tableau builds down by rank regardless of suit. Empty columns accept any card. */
export function canPlaceOnTableau(card: CardId, target: CardId | null): boolean {
  if (target === null) return true;
  return rankOfCard(card) === rankOfCard(target) - 1;
}

/** Start index of a same-suit King→Ace suffix, or -1. */
export function completedRunStart(cards: readonly CardId[]): number {
  if (cards.length < FOUNDATION_SIZE) return -1;
  const start = cards.length - FOUNDATION_SIZE;
  const run = cards.slice(start);
  return isKing(run[0] as CardId) && isAce(run[FOUNDATION_SIZE - 1] as CardId) && isPackedRun(run)
    ? start
    : -1;
}

/** Tableau order is rules-significant; never presentation-sort it. */
export const orderSpiderHand: HandOrder = keepHandOrder;
