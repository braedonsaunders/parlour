import type { CardId, LegalMove, SeatId } from '@parlour/engine';
import type { BlitzState } from '../state';
import { bestSuit, pipValue, suitOf } from '../hand';
import { dangerScore, discardLoss, inferOpponents, type OpponentInsight } from './evaluate';

/** Tunable knobs every persona/tier skews off these defaults (spec §9). */
export interface BotParams {
  /** base hand-value threshold for knocking */
  knockAt: number;
  /** Monte-Carlo P(win | knock now) gate; null = probability unused (tier 1–2) */
  knockProb: number | null;
  /** expected one-turn improvement credited to opponents when pricing a knock */
  opponentUplift: number;
  /** how strongly opponent suit-inference shapes discard safety (0 = blind) */
  memory: number;
  /** keep drawing toward 31 instead of banking a solid knock */
  chaseBlitz: boolean;
  /** weight on denying the discard top from suit-hungry opponents */
  denial: number;
  /** how much opponents' hidden cards are assumed curated toward strength */
  curationBias: number;
}

export function isDiscardPhase(legal: readonly LegalMove[]): boolean {
  return legal.some((m) => m.id === 'discard');
}

export function lockedCard(view: BlitzState): CardId | null {
  return view.rules.discardLock ? view.drawnFromDiscard : null;
}

/**
 * Score-based discard choice: minimize value lost minus a danger rebate for
 * cards opponents' inferred suits are hungry for. The just-drawn locked card
 * is excluded — validate would reject it anyway.
 */
export interface DiscardOptions {
  memory: number;
  /** bait suit-hungry opponents with low junk of the suit they collect */
  feedJunk?: boolean;
}

export function chooseSafeDiscard(
  view: BlitzState,
  seat: SeatId,
  legal: readonly LegalMove[],
  opts: DiscardOptions | number,
): LegalMove | null {
  const memory = typeof opts === 'number' ? opts : opts.memory;
  const feedJunk = typeof opts === 'number' ? false : (opts.feedJunk ?? false);
  const lock = lockedCard(view);
  const insights: readonly OpponentInsight[] =
    memory > 0 || feedJunk ? inferOpponents(view, seat) : [];
  const hand = view.hands[seat] ?? [];

  let best: { move: LegalMove; score: number } | null = null;
  for (const move of legal) {
    if (move.id !== 'discard') continue;
    const card = (move.payload as { card: CardId }).card;
    if (lock !== null && card === lock && hand.length > 1) continue;
    const loss = discardLoss(hand, card, view.rules);
    const danger = insights.length > 0 ? dangerScore(insights, card) : 0;
    // feeding: junk pips of a suit an opponent hoards tempt them into weak
    // takes — tempo denial worth more the lower the gift
    let feed = 0;
    if (feedJunk && pipValue(card) <= 6) {
      for (const insight of insights) {
        const appetite = insight.weights.get(suitOf(card)) ?? 0;
        if (appetite >= 15) feed += ((appetite / 10) * (7 - pipValue(card))) / 2;
      }
    }
    const score = loss - memory * danger - feed;
    if (
      !best ||
      score < best.score ||
      (score === best.score && card < (best.move.payload as { card: CardId }).card)
    ) {
      best = { move, score };
    }
  }
  return (
    best?.move ??
    legal.find((m) => m.id === 'discard' && !isLocked(m, lock)) ??
    legal.find((m) => m.id === 'discard') ??
    null
  );
}

/**
 * Naive discard for tier 1: dump the lowest-pip card outside the best suit
 * ("throw away junk"), no value math beyond that.
 */
export function chooseNaiveDiscard(
  view: BlitzState,
  seat: SeatId,
  legal: readonly LegalMove[],
): LegalMove | null {
  const lock = lockedCard(view);
  const hand = view.hands[seat] ?? [];
  const keepSuit = bestSuit(hand)?.suit;

  let best: { move: LegalMove; pips: number } | null = null;
  for (const move of legal) {
    if (move.id !== 'discard') continue;
    const card = (move.payload as { card: CardId }).card;
    if (lock !== null && card === lock && hand.length > 1) continue;
    if (keepSuit !== undefined && suitOf(card) === keepSuit && hand.length > 1) continue;
    const pips = pipValue(card);
    if (!best || pips < best.pips) best = { move, pips };
  }
  return (
    best?.move ??
    legal.find((m) => m.id === 'discard' && !isLocked(m, lock)) ??
    legal.find((m) => m.id === 'discard') ??
    null
  );
}

function isLocked(move: LegalMove, lock: CardId | null): boolean {
  return lock !== null && (move.payload as { card: CardId } | undefined)?.card === lock;
}

export function turnMoves(legal: readonly LegalMove[]): {
  knock: LegalMove | undefined;
  stock: LegalMove | undefined;
  discardTop: LegalMove | undefined;
} {
  return {
    knock: legal.find((m) => m.id === 'knock'),
    stock: legal.find((m) => m.id === 'draw.stock'),
    discardTop: legal.find((m) => m.id === 'draw.discard'),
  };
}
