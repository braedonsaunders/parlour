import {
  pairedTeams,
  stableCardOrder,
  type CardFace,
  type CardId,
  type DeckDef,
  type HandOrder,
  type SeatId,
} from '@parlour/engine';
import type { TrickRules } from '@parlour/tricks';

export const PINOCHLE_SEATS = 4;
export const HAND_SIZE = 12;
export const TRICKS_PER_HAND = HAND_SIZE;

export const PINOCHLE_SUITS = ['S', 'H', 'D', 'C'] as const;
export type PinochleSuit = (typeof PINOCHLE_SUITS)[number];

export const PINOCHLE_SUIT_NAMES: Record<PinochleSuit, string> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};

const SUIT_COLOR: Record<PinochleSuit, string> = {
  S: 'black',
  C: 'black',
  H: 'red',
  D: 'red',
};

const SUIT_GLYPH: Record<PinochleSuit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

/** The six ranks a pinochle deck carries, each present twice per suit. */
export const PINOCHLE_RANKS = ['9', 'J', 'Q', 'K', '10', 'A'] as const;
export type PinochleRank = (typeof PINOCHLE_RANKS)[number];

/** Printed pip value (for face labels only — trick strength uses {@link trickRankOf}). */
const PRINTED_RANK: Record<PinochleRank, number> = { '9': 9, J: 11, Q: 12, K: 13, '10': 10, A: 14 };

/** Trick-taking strength, high to low: A > 10 > K > Q > J > 9. */
const TRICK_RANK: Record<PinochleRank, number> = { A: 6, '10': 5, K: 4, Q: 3, J: 2, '9': 1 };

/** Card points captured in tricks: each Ace, Ten and King is worth 10; the rest are 0. */
const CARD_POINTS: Record<PinochleRank, number> = { A: 10, '10': 10, K: 10, Q: 0, J: 0, '9': 0 };

export const GAME_ID = 'pinochle';
export const DECK_SIZE = 48;

const TABLE_TEAMS = pairedTeams(PINOCHLE_SEATS);

export function teamOf(seat: SeatId): 0 | 1 {
  return TABLE_TEAMS.teamOf(seat) as 0 | 1;
}

export function partnerOf(seat: SeatId): SeatId {
  return TABLE_TEAMS.partnerOf(seat) ?? seat;
}

export function seatsOf(team: 0 | 1): readonly SeatId[] {
  return TABLE_TEAMS.seatsOf(team);
}

/**
 * Builds the 48-card double deck: two copies of A/10/K/Q/J/9 in each suit.
 * Card ids are `${suit}${rank}-${copy}` (e.g. `SA-0`, `SA-1`, `S10-0`) — unique
 * per physical card, with the rank/suit both readable straight off the id.
 */
export function pinochleDeck(): DeckDef {
  const cardIds: CardId[] = [];
  const faces: Record<CardId, CardFace> = {};
  for (const suit of PINOCHLE_SUITS) {
    for (const rank of PINOCHLE_RANKS) {
      for (let copy = 0; copy < 2; copy++) {
        const id = `${suit}${rank}-${copy}`;
        cardIds.push(id);
        faces[id] = {
          label: `${rank}${SUIT_GLYPH[suit]}`,
          short: `${rank}${suit}`,
          suit,
          rank: PRINTED_RANK[rank],
          color: SUIT_COLOR[suit],
          meta: { copy },
        };
      }
    }
  }
  return { id: 'pinochle-48', cardIds, faces };
}

const CARD_ID_PATTERN = /^([SHDC])(9|10|[JQKA])-(\d)$/;

function parseCard(card: CardId): { suit: PinochleSuit; rank: PinochleRank } | null {
  const match = CARD_ID_PATTERN.exec(card);
  if (!match) return null;
  return { suit: match[1] as PinochleSuit, rank: match[2] as PinochleRank };
}

export function suitOfCard(card: CardId): PinochleSuit | null {
  return parseCard(card)?.suit ?? null;
}

export function rankOfCard(card: CardId): PinochleRank | null {
  return parseCard(card)?.rank ?? null;
}

/** Trick strength: A(6) > 10(5) > K(4) > Q(3) > J(2) > 9(1). */
export function trickRankOf(card: CardId): number {
  const rank = rankOfCard(card);
  return rank === null ? -1 : TRICK_RANK[rank];
}

/** Card points a captured trick card is worth: Ace/Ten/King = 10, else 0. */
export function pointsOf(card: CardId): number {
  const rank = rankOfCard(card);
  return rank === null ? 0 : CARD_POINTS[rank];
}

/**
 * Follow/winner rules for a named trump: highest trump wins, else highest of
 * the led suit. Equal rank of the same suit resolves in `@parlour/tricks` by
 * requiring a strictly higher rank to overtake — the first card played of a
 * tied rank/suit keeps the trick, exactly as the locked ruleset requires.
 */
export function pinochleTrickRules(trump: PinochleSuit): TrickRules {
  return {
    suitOf: (card) => suitOfCard(card),
    rankOf: (card) => trickRankOf(card),
    trumpSuit: trump,
  };
}

const HAND_SUIT_ORDER_BASE: readonly PinochleSuit[] = ['C', 'D', 'H', 'S'];

/** Groups by suit (trump last once named), ranks high to low within a suit. */
export const orderPinochleHand: HandOrder = (cards, context) => {
  const rawTrump = context.trump;
  const trump = (PINOCHLE_SUITS as readonly string[]).includes(rawTrump as string)
    ? (rawTrump as PinochleSuit)
    : null;
  const suitOrder = trump
    ? [...HAND_SUIT_ORDER_BASE.filter((suit) => suit !== trump), trump]
    : HAND_SUIT_ORDER_BASE;
  const suitPosition = new Map(suitOrder.map((suit, index) => [suit, index]));

  return stableCardOrder(cards, (left, right) => {
    const aSuit = suitOfCard(left);
    const bSuit = suitOfCard(right);
    if (aSuit === null) return bSuit === null ? 0 : 1;
    if (bSuit === null) return -1;
    const suitDiff = (suitPosition.get(aSuit) ?? 99) - (suitPosition.get(bSuit) ?? 99);
    if (suitDiff !== 0) return suitDiff;
    return trickRankOf(right) - trickRankOf(left);
  });
};
