import { deckSize } from './cards';
import type { OhHellRules } from './config';

/**
 * Hand-size scheduling — the reason Parlour's `MatchDef.roundConfig` exists.
 * A match deals bigger and bigger hands until the deck can barely cover the
 * table, then (usually) comes back down.
 *
 * Two ceilings govern everything:
 *  - `dealCeiling`: the largest hand whose deal FITS in the deck at all
 *    (`floor(deck / seats)`). Dealing exactly this many cards exhausts the
 *    deck, which is what makes a full-deck round possible.
 *  - `trumpCeiling`: the largest hand that still leaves one card to turn for
 *    trump (`floor((deck - 1) / seats)`). The arc generator caps here, so a
 *    generated schedule always has a trump card — and never exceeds the
 *    classic `floor(51 / seats)` bound for the standard deck.
 */

/** Largest per-seat hand whose deal fits in the deck (may consume it whole). */
export function dealCeiling(seats: number, wizards: boolean): number {
  return Math.floor(deckSize(wizards) / Math.max(1, seats));
}

/** Largest per-seat hand that still leaves one card over to turn for trump. */
export function trumpCeiling(seats: number, wizards: boolean): number {
  return Math.floor((deckSize(wizards) - 1) / Math.max(1, seats));
}

/**
 * The round-by-round hand sizes for a match: e.g. four players with maxHand 9
 * on the classic up-down arc play 1,2,…,8,9,8,…,2,1 — nineteen rounds.
 */
export function roundSchedule(
  rules: Pick<OhHellRules, 'handArc' | 'maxHand' | 'wizards'>,
  seats: number,
): number[] {
  const peak = Math.max(1, Math.min(Math.round(rules.maxHand), trumpCeiling(seats, rules.wizards)));
  const up = Array.from({ length: peak }, (_, i) => i + 1);
  switch (rules.handArc) {
    case 'up':
      return up;
    case 'down':
      return [...up].reverse();
    case 'updown': {
      const down = up.slice(0, -1).reverse();
      return [...up, ...down];
    }
  }
}

/**
 * Per-round deal arithmetic. Returns the hand size to actually deal plus
 * whether a trump card survives the deal:
 *  - normally the top of the post-deal stock is turned;
 *  - when the deal would consume the whole deck there is nothing left to turn
 *    — that round is no-trump unless `trumpOnLastRound` says cut one from the
 *    bottom first, shrinking every hand by enough to keep the flip honest
 *    (equal hands, dealt from the remaining deck).
 */
export function planDeal(
  handSize: number,
  seats: number,
  wizards: boolean,
  trumpOnLastRound: boolean,
): { handSize: number; wholeDeck: boolean } {
  const deck = deckSize(wizards);
  let size = Math.max(1, Math.min(Math.round(handSize), dealCeiling(seats, wizards)));
  if (seats * size >= deck && trumpOnLastRound) {
    size = Math.min(size, trumpCeiling(seats, wizards));
  }
  // Equal hands are non-negotiable; after the shrink this always holds with a
  // spare card, so "no card left to turn" only ever happens on the un-shrunk
  // whole-deck deal.
  if (seats * size >= deck) return { handSize: size, wholeDeck: true };
  return { handSize: size, wholeDeck: false };
}
