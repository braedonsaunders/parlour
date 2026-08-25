import { isWildCard, LAST_RANK, spiteFace } from '../cards';
import type { LegalMove } from '@parlour/engine';
import type { CardId } from '@parlour/engine';
import type { SpiteState } from '../state';
import type { PlaySource } from '../game';

/**
 * Shared bot heuristics. Everything here reads the *masked* player view only:
 * opponents' hands arrive as '??' and are never touched, so a stronger tier
 * can never mean better eyes.
 */

/** Where the card a `build` move names is coming from. */
export function sourceOf(state: SpiteState, seat: number, card: CardId): PlaySource | null {
  if ((state.hands[seat] ?? []).includes(card)) return { kind: 'hand' };
  if (state.payoffs[seat]?.[0] === card) return { kind: 'payoff' };
  const piles = state.discards[seat] ?? [];
  for (let pile = 0; pile < piles.length; pile++) {
    if (piles[pile]?.[0] === card) return { kind: 'discard', pile };
  }
  return null;
}

export interface BuildOption {
  move: LegalMove;
  card: CardId;
  pile: number;
  /** the rank this play claims — the recorded rank when the card is wild */
  rank: number;
  source: PlaySource;
  wild: boolean;
}

/** Structures every legal centre play the seat could make right now. */
export function buildOptions(
  view: SpiteState,
  legal: readonly LegalMove[],
  seat: number,
): BuildOption[] {
  const options: BuildOption[] = [];
  for (const move of legal) {
    if (move.id !== 'build') continue;
    const payload = move.payload as { card?: unknown; pile?: unknown; rank?: unknown } | undefined;
    const card = payload?.card;
    const pile = payload?.pile;
    const rank = payload?.rank;
    if (typeof card !== 'string' || typeof pile !== 'number' || typeof rank !== 'number') continue;
    const source = sourceOf(view, seat, card);
    if (!source) continue;
    options.push({ move, card, pile, rank, source, wild: isWildCard(card) });
  }
  return options;
}

export interface DiscardOption {
  move: LegalMove;
  card: CardId;
  pile: number;
}

export function discardOptions(view: SpiteState, legal: readonly LegalMove[]): DiscardOption[] {
  const options: DiscardOption[] = [];
  for (const move of legal) {
    if (move.id !== 'discard') continue;
    const payload = move.payload as { card?: unknown; pile?: unknown } | undefined;
    const card = payload?.card;
    const pile = payload?.pile;
    if (typeof card !== 'string' || typeof pile !== 'number') continue;
    options.push({ move, card, pile });
  }
  return options;
}

/** How far the card sits from anything any centre pile will accept soon. */
export function nearestNeedDistance(view: SpiteState, card: CardId): number {
  if (isWildCard(card)) return 0;
  const value = spiteFace(card).meta.value;
  let best = Infinity;
  for (const pile of view.centre) {
    best = Math.min(best, Math.abs(pile.nextRank - value));
  }
  // An Ace always has a home once some pile retires, so never score it hopeless.
  best = Math.min(best, Math.abs(value - 1));
  return Number.isFinite(best) ? best : LAST_RANK;
}

/**
 * How much a hand card is worth keeping, for discard decisions. Wilds top the
 * scale; near-needs follow; an Ace keeps a floor of usefulness because piles
 * retire and restart all game.
 */
export function keepScore(view: SpiteState, card: CardId): number {
  if (isWildCard(card)) return 40;
  const face = spiteFace(card);
  let score = 20 - nearestNeedDistance(view, card) * 4;
  if (face.meta.value === 1) score += 6;
  return score;
}
