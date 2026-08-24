import {
  isVeilHandle,
  stableCardOrder,
  type CardFace,
  type CardId,
  type DeckDef,
  type HandOrder,
} from '@parlour/engine';

/**
 * The commercial deck, card for card.
 *
 * Spite & Malice is traditionally played with two standard 52-card decks, and
 * this pack used to deal exactly that: four colours, Ace through King, Kings
 * and Jokers standing in as wilds. But suit never mattered — no rule in this
 * pack ever read it — and neither did the colour that replaced it, so the deck
 * was drawing four loud categories that meant nothing and inviting the eye to
 * hunt for a pattern that was not there.
 *
 * The commercial version solved that by throwing the standard deck out: one
 * hundred and forty-four numbered cards, twelve of each rank from 1 to 12, and
 * eighteen wilds. Nothing else. That is what this deals now. A card is a number
 * or it is wild, and every distinction on its face is one the rules read.
 */

/** A build pile climbs this ladder and retires the moment its top reads 12. */
export const FIRST_RANK = 1;
export const LAST_RANK = 12;

/** Twelve of every rank, and eighteen wilds: 162 cards. */
const COPIES_PER_RANK = 12;
const WILD_COUNT = 18;

export function rankLabel(rank: number): string {
  return String(rank);
}

/** Every face the table can hold. */
export type SpiteKind =
  | 'number'
  | 'wild'
  /** a card dealt under Veil: present at the table, unreadable by it */
  | 'veiled';

export interface SpiteCardMeta extends Record<string, unknown> {
  kind: SpiteKind;
  /**
   * The rank this face builds as, and 0 for a wild.
   *
   * A wild has no rank of its own — what a played one stands for lives in the
   * state's `wildRanks`, never in the face, because the same card can be a 3 on
   * one pile and a 9 the next time it comes round.
   */
  value: number;
}

export interface SpiteFace extends CardFace {
  meta: SpiteCardMeta;
}

const cardIds: CardId[] = [];
const faces: Record<CardId, SpiteFace> = {};

for (let value = FIRST_RANK; value <= LAST_RANK; value++) {
  for (let copy = 0; copy < COPIES_PER_RANK; copy++) {
    const id = `${value}-${copy}`;
    cardIds.push(id);
    faces[id] = {
      label: String(value),
      short: String(value),
      rank: value,
      meta: { kind: 'number', value },
    };
  }
}

for (let copy = 0; copy < WILD_COUNT; copy++) {
  const id = `wild-${copy}`;
  cardIds.push(id);
  faces[id] = { label: 'wild', short: 'W', meta: { kind: 'wild', value: 0 } };
}

/** Every card the pack can ever deal: 144 numbers and 18 wilds. */
export const spiteDeck: DeckDef = {
  id: 'spite-162',
  cardIds,
  faces,
};

/**
 * The deck a table actually shuffles.
 *
 * One deck, whatever the seat count — the commercial game does not scale by
 * players either, because completed build piles are shuffled straight back
 * into the stock and keep it circulating. The only knob is how many wilds ride
 * along; a table that wants them scarcer leaves the rest home rather than
 * dealing them as dead weight.
 */
export function dealtDeck(wilds: number): DeckDef {
  const kept = Math.max(0, Math.min(WILD_COUNT, Math.trunc(wilds)));
  if (kept === WILD_COUNT) return spiteDeck;
  return {
    id: `spite-${144 + kept}`,
    cardIds: cardIds.filter((id) => !id.startsWith('wild-') || Number(id.slice(5)) < kept),
    faces,
  };
}

/**
 * The face every veiled handle wears. It matches nothing and plays on nothing,
 * so a rule that reaches for a hidden card's rank gets a definite "no" instead
 * of a crash.
 */
export const SPITE_VEILED_FACE: SpiteFace = Object.freeze({
  label: 'face down',
  short: '',
  meta: Object.freeze({ kind: 'veiled', value: 0 }) as SpiteCardMeta,
});

export function spiteFace(card: CardId): SpiteFace {
  const face = faces[card];
  if (face) return face;
  if (isVeilHandle(card)) return SPITE_VEILED_FACE;
  throw new Error(`unknown spite card: ${card}`);
}

export function isWildCard(card: CardId): boolean {
  return spiteFace(card).meta.kind === 'wild';
}

/**
 * Low ranks first — they are the ones an early pile wants — with wilds held to
 * the end where the eye finds them fast. Presentation only; the authoritative
 * zone is never touched.
 *
 * Copies of a rank are identical now that colour is gone, so ties fall through
 * to the id purely to keep the order stable across renders.
 */
export const orderSpiteHand: HandOrder = (cards) =>
  stableCardOrder(cards, (left, right) => {
    const a = faces[left];
    const b = faces[right];
    if (!a || a.meta.kind === 'veiled') return b && b.meta.kind !== 'veiled' ? 1 : 0;
    if (!b || b.meta.kind === 'veiled') return -1;
    const wildDiff = Number(a.meta.kind === 'wild') - Number(b.meta.kind === 'wild');
    if (wildDiff !== 0) return wildDiff;
    const valueDiff = a.meta.value - b.meta.value;
    if (valueDiff !== 0) return valueDiff;
    return left.localeCompare(right);
  });
