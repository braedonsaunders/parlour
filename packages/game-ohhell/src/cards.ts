import {
  stdDeck,
  type CardFace,
  type CardId,
  type DeckDef,
  type HandOrder,
  type SeatId,
} from '@parlour/engine';
import { faceRules, resolveTrickWinner, type Trick, type TrickRules } from '@parlour/tricks';

export const MIN_SEATS = 3;
export const MAX_SEATS = 7;

export const SUIT_CLUBS = 'clubs';
export const SUIT_DIAMONDS = 'diamonds';
export const SUIT_HEARTS = 'hearts';
export const SUIT_SPADES = 'spades';

export const SUITS: readonly string[] = [SUIT_CLUBS, SUIT_DIAMONDS, SUIT_HEARTS, SUIT_SPADES];

export const WIZARDS_PER_DECK = 4;
export const JESTERS_PER_DECK = 4;

/**
 * Oh Hell plays the standard 52-card deck; the Wizard variant appends four
 * Wizards and four Jesters (60 cards). Specials carry unique ids so zones stay
 * id-keyed like every other parlour game.
 */
export function ohhellDeck(wizards: boolean): DeckDef {
  const base = stdDeck();
  if (!wizards) return base;
  const cardIds: CardId[] = [...base.cardIds];
  const faces: Record<CardId, CardFace> = { ...base.faces };
  for (let n = 1; n <= WIZARDS_PER_DECK; n++) {
    const id = `W${n}`;
    cardIds.push(id);
    faces[id] = {
      label: 'Wizard',
      short: 'W',
      rank: 15,
      color: 'violet',
      meta: { special: 'wizard' },
    };
  }
  for (let n = 1; n <= JESTERS_PER_DECK; n++) {
    const id = `J${n}`;
    cardIds.push(id);
    faces[id] = {
      label: 'Jester',
      short: 'J',
      rank: 0,
      color: 'amber',
      meta: { special: 'jester' },
    };
  }
  return { id: wizards ? 'ohhell-60' : 'std-52', cardIds, faces };
}

/** Every face of the biggest deck this game can ship; plain decks are a subset. */
const ALL_FACES: Readonly<Record<CardId, CardFace>> = ohhellDeck(true).faces;

export const STD_DECK: DeckDef = ohhellDeck(false);

export function deckSize(wizards: boolean): number {
  return wizards ? STD_DECK.cardIds.length + WIZARDS_PER_DECK + JESTERS_PER_DECK : 52;
}

export type SpecialKind = 'wizard' | 'jester';

function specialOf(card: CardId): SpecialKind | null {
  const kind = ALL_FACES[card]?.meta?.special;
  return kind === 'wizard' || kind === 'jester' ? kind : null;
}

export function isWizard(card: CardId): boolean {
  return specialOf(card) === 'wizard';
}

export function isJester(card: CardId): boolean {
  return specialOf(card) === 'jester';
}

export function isSpecial(card: CardId): boolean {
  return specialOf(card) !== null;
}

/** Wizards and Jesters have no suit — they follow nothing and beat/lose to everything. */
export function suitOfCard(card: CardId): string | null {
  const face = ALL_FACES[card];
  return typeof face?.suit === 'string' ? face.suit : null;
}

/** Printed rank from the std deck (A=1 … K=13); Wizard=15, Jester=0, unknown −1. */
export function printedRank(card: CardId): number {
  const rank = ALL_FACES[card]?.rank;
  return typeof rank === 'number' ? rank : -1;
}

/** Ace-high trick rank: 2 < … < K < A. Specials sit outside the scale. */
export function rankOfCard(card: CardId): number {
  const rank = printedRank(card);
  return rank === 1 ? 14 : rank;
}

/**
 * Winner rules handed to @parlour/tricks. The `effectiveSuit` hook is what
 * makes the Wizard variant work without bending the shared package: specials
 * report `null`, so they never set or match a led suit and `resolveTrickWinner`
 * skips them entirely. First-Wizard-wins / all-Jesters layering lives in
 * game.ts on top of that neutral base.
 */
export function ohhellTrickRules(trumpSuit: string | null): TrickRules {
  const faces = faceRules(ALL_FACES);
  return {
    suitOf: faces.suitOf,
    rankOf: rankOfCard,
    effectiveSuit: (card) => (isSpecial(card) ? null : faces.suitOf(card)),
    trumpSuit: trumpSuit ?? null,
  };
}

/**
 * Oh Hell's winner on top of the neutral resolver: the FIRST Wizard played
 * takes the trick outright; if every card is a Jester the first Jester wins;
 * otherwise the Jesters drop out and @parlour/tricks picks among real cards
 * (highest trump, else highest of the led suit). Works on partial tricks too —
 * bots use it as "who is winning right now".
 */
export function resolveOhHellWinner(trick: Trick, trumpSuit: string | null): SeatId | null {
  if (trick.plays.length === 0) return null;
  const firstWizard = trick.plays.find((play) => isWizard(play.card));
  if (firstWizard) return firstWizard.seat;
  const real = trick.plays.filter((play) => !isSpecial(play.card));
  if (real.length === 0) return trick.plays[0]!.seat;
  return resolveTrickWinner({ ...trick, plays: real }, ohhellTrickRules(trumpSuit));
}

// ---------------------------------------------------------------------------
// Presentation ordering
// ---------------------------------------------------------------------------

const HAND_SUIT_ORDER: Readonly<Record<string, number>> = {
  [SUIT_CLUBS]: 0,
  [SUIT_DIAMONDS]: 1,
  [SUIT_HEARTS]: 2,
  [SUIT_SPADES]: 3,
};

function compareCardIds(left: CardId, right: CardId): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Jesters first, then plain suits in rotation order with THIS round's trump
 * last, Wizards on top. `context.trumpSuit` carries the round's trump.
 * Presentation only — the authoritative zone is never reordered.
 */
export const orderOhHellHand: HandOrder = (cards, context) => {
  const trump = typeof context.trumpSuit === 'string' ? context.trumpSuit : null;
  const bandOf = (card: CardId): number => {
    if (isWizard(card)) return 4;
    if (isJester(card)) return -1;
    const suit = suitOfCard(card);
    if (suit === null) return 2;
    if (trump !== null && suit === trump) return 3;
    return HAND_SUIT_ORDER[suit] ?? 2;
  };
  return cards
    .map((card, index) => ({ card, index }))
    .sort(
      (left, right) =>
        bandOf(left.card) - bandOf(right.card) ||
        rankOfCard(right.card) - rankOfCard(left.card) ||
        compareCardIds(left.card, right.card),
    )
    .map(({ card }) => card);
};
