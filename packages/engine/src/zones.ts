import type { CardId, DeckDef, Rng } from './types';

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
