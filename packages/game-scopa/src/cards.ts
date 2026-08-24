import {
  pairedTeams,
  stableCardOrder,
  type CardFace,
  type CardId,
  type DeckDef,
  type HandOrder,
  type SeatId,
  type TeamMap,
} from '@parlour/engine';

/** Seat counts Scopa supports; 4 and 6 play in fixed partnerships. */
export const GAME_SEATS = [2, 3, 4, 6] as const;
export const PARTNERSHIP_SEATS = [4, 6] as const;

export const DECK_SIZE = 40;
export const TABLE_SIZE = 4;
export const DEAL_PER_TURN = 3;

export const SUIT_DENARI = 'denari';
export const SUIT_COPPE = 'coppe';
export const SUIT_SPADE = 'spade';
export const SUIT_BASTONI = 'bastoni';
export const SUITS = [SUIT_DENARI, SUIT_COPPE, SUIT_SPADE, SUIT_BASTONI] as const;
export type SuitName = (typeof SUITS)[number];

interface SuitSpec {
  /** id prefix — stable forever, match history keys on these ids */
  key: string;
  italian: SuitName;
  french: string;
  symbol: string;
  red: boolean;
}

const SUIT_SPECS: readonly SuitSpec[] = [
  { key: 'D', italian: SUIT_DENARI, french: 'diamonds', symbol: '♦', red: true },
  { key: 'C', italian: SUIT_COPPE, french: 'hearts', symbol: '♥', red: true },
  { key: 'S', italian: SUIT_SPADE, french: 'spades', symbol: '♠', red: false },
  { key: 'B', italian: SUIT_BASTONI, french: 'clubs', symbol: '♣', red: false },
];

const ITALIAN_SUIT_BY_KEY: Readonly<Record<string, SuitName>> = Object.fromEntries(
  SUIT_SPECS.map((suit) => [suit.key, suit.italian]),
);

// 8/9/10 are Fante/Cavallo/Re; the French display maps them to J/Q/K so the
// shared card art renders them. Ranks stay 1..10 underneath.
const FRENCH_RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', 'J', 'Q', 'K'] as const;

function buildDeck(french: boolean): DeckDef {
  const cardIds: CardId[] = [];
  const faces: Record<CardId, CardFace> = {};
  for (const suit of SUIT_SPECS) {
    for (let rank = 1; rank <= 10; rank++) {
      const id = `${suit.key}${rank}`;
      cardIds.push(id);
      const numeral = String(rank);
      const display = FRENCH_RANK_LABELS[rank - 1] ?? numeral;
      faces[id] = {
        label: french ? `${display}${suit.symbol}` : `${numeral}${suit.key}`,
        short: french ? display : numeral,
        suit: french ? suit.french : suit.italian,
        rank,
        color: suit.red ? 'red' : 'black',
        meta: { italianSuit: suit.italian },
      };
    }
  }
  return { id: french ? 'italiane-40-french' : 'italiane-40', cardIds, faces };
}

/**
 * Default faces use the French mapping (config `frenchSuits` defaults on) so
 * the existing card renderer works untouched. `DECK_ITALIANO` carries the
 * Italian suit names and numerals for tables that turn the toggle off. Both
 * share the same card ids — only presentation differs.
 */
export const DECK = buildDeck(true);
export const DECK_ITALIANO = buildDeck(false);

export function deckForDisplay(frenchSuits: boolean): DeckDef {
  return frenchSuits ? DECK : DECK_ITALIANO;
}

/**
 * Capture value is the pip number printed on the card (Asso 1 … Re 10), read
 * straight off the stable id — never off the display face, which may say J/Q/K.
 */
export function captureValue(card: CardId): number {
  return Number.parseInt(card.slice(1), 10);
}

/** Semantic (Italian) suit of a card, independent of the display mode. */
export function suitOfCard(card: CardId): SuitName {
  return ITALIAN_SUIT_BY_KEY[card.charAt(0)] ?? SUIT_DENARI;
}

export function isDenari(card: CardId): boolean {
  return suitOfCard(card) === SUIT_DENARI;
}

/** The settebello — 7 of coins, always worth exactly 1 point to its capturer. */
export function isSettebello(card: CardId): boolean {
  return card === 'D7';
}

/** The King of coins, worth a bonus point under the `reDenari` house rule. */
export function isReDenari(card: CardId): boolean {
  return card === 'D10';
}

/** Kings (Re, rank 10) on the initial tableau force a redeal. */
export function countKings(cards: readonly CardId[]): number {
  return cards.filter((card) => captureValue(card) === 10).length;
}

const TEAM_MAPS: Partial<Record<number, TeamMap>> = {
  4: pairedTeams(4),
  6: pairedTeams(6),
};

export function playsInTeams(seats: number): boolean {
  return seats === 4 || seats === 6;
}

/** Score-owner index for a seat: the team at partnership sizes, else the seat. */
export function ownerOf(seat: SeatId, seats: number): number {
  return TEAM_MAPS[seats] ? (TEAM_MAPS[seats] as TeamMap).teamOf(seat) : seat;
}

export function ownerCount(seats: number): number {
  return playsInTeams(seats) ? 2 : seats;
}

export function seatsOfOwner(owner: number, seats: number): readonly SeatId[] {
  const teams = TEAM_MAPS[seats];
  if (!teams) return [owner];
  return teams.seatsOf(owner);
}

const HAND_SUIT_ORDER: Readonly<Record<SuitName, number>> = {
  [SUIT_DENARI]: 0,
  [SUIT_COPPE]: 1,
  [SUIT_SPADE]: 2,
  [SUIT_BASTONI]: 3,
};

/** Denari → coppe → spade → bastoni, ascending pip value inside each suit. */
export const orderScopaHand: HandOrder = (cards) =>
  stableCardOrder(cards, (left, right) => {
    const suitDiff =
      (HAND_SUIT_ORDER[suitOfCard(left)] ?? 99) - (HAND_SUIT_ORDER[suitOfCard(right)] ?? 99);
    if (suitDiff !== 0) return suitDiff;
    return captureValue(left) - captureValue(right) || (left < right ? -1 : left > right ? 1 : 0);
  });

export interface Layout {
  hands: CardId[][];
  table: CardId[];
  stock: CardId[];
}

/**
 * Splits a shuffled deck into the opening tableau (four face up) and hands.
 * Ordinary Scopa deals 3 cards each and keeps the rest as stock; Scopone
 * spreads the whole remainder (`36 % seats === 0` for every supported size).
 * Deal rotation starts left of the dealer, as at a real table.
 */
export function dealLayout(order: readonly CardId[], seats: number, scopone: boolean): Layout {
  const table = order.slice(0, TABLE_SIZE);
  const pool = order.slice(TABLE_SIZE);
  const perHand = scopone ? Math.floor(pool.length / seats) : DEAL_PER_TURN;
  const hands: CardId[][] = Array.from({ length: seats }, () => []);
  let cursor = 0;
  for (let round = 0; round < perHand; round++) {
    for (let seat = 0; seat < seats; seat++) {
      hands[seat]!.push(pool[cursor++] as CardId);
    }
  }
  return { hands, table, stock: pool.slice(cursor) };
}
