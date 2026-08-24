import type { CardComparator, CardId, DeckDef, HandOrder, HandOrderContext, Rng } from './types';

/** Ordered card ids. Index 0 is the TOP of the zone (next to be drawn / last discarded). */
export type Zone = readonly CardId[];

export interface DrawResult {
  drawn: CardId[];
  rest: CardId[];
}

export function drawFrom(zone: Zone, n: number): DrawResult {
  const count = Math.max(0, Math.min(n, zone.length));
  return { drawn: zone.slice(0, count), rest: zone.slice(count) };
}

export function peekTop(zone: Zone): CardId | null {
  return zone.length > 0 ? (zone[0] as CardId) : null;
}

export function addTo(zone: Zone, id: CardId): CardId[] {
  return [id, ...zone];
}

export function addToBottom(zone: Zone, id: CardId): CardId[] {
  return [...zone, id];
}

export function removeFrom(zone: Zone, id: CardId): CardId[] {
  const at = zone.indexOf(id);
  if (at < 0) return zone.slice();
  return [...zone.slice(0, at), ...zone.slice(at + 1)];
}

export function shuffledIds(deck: DeckDef, rng: Rng): CardId[] {
  return rng.shuffle(deck.cardIds);
}

/** Stable copied sort for presentation code; authoritative zones stay untouched. */
export function stableCardOrder(cards: readonly CardId[], compare: CardComparator): CardId[] {
  return cards
    .map((card, index) => ({ card, index }))
    .sort((left, right) => compare(left.card, right.card) || left.index - right.index)
    .map(({ card }) => card);
}

/** Explicit order for packs whose facedown pile sequence is rules-critical. */
export const keepHandOrder: HandOrder = (cards) => [...cards];

/**
 * Applies a pack's order to a copied hand and verifies that presentation did
 * not lose, duplicate, or substitute a card.
 */
export function orderedHand(
  cards: readonly CardId[],
  order: HandOrder,
  context: HandOrderContext = {},
): CardId[] {
  const ordered = [...order([...cards], context)];
  const remaining = new Map<CardId, number>();
  for (const card of cards) remaining.set(card, (remaining.get(card) ?? 0) + 1);
  for (const card of ordered) remaining.set(card, (remaining.get(card) ?? 0) - 1);
  if (ordered.length !== cards.length || [...remaining.values()].some((count) => count !== 0)) {
    throw new Error('hand order must return every card exactly once');
  }
  return ordered;
}
