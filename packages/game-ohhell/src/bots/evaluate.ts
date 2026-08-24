import type { CardId } from '@parlour/engine';
import type { Trick, TrickPlay } from '@parlour/tricks';
import {
  isJester,
  isSpecial,
  isWizard,
  rankOfCard,
  resolveOhHellWinner,
  suitOfCard,
} from '../cards';
import type { OhHellState } from '../state';

/** The caller's actual cards out of an (already redacted) player view. */
export function ownHand(view: OhHellState, seat: number): CardId[] {
  return (view.hands[seat] ?? []).filter((card) => card !== '??');
}

/**
 * Suits each seat is known to be out of, mined from the PUBLIC play history.
 * Plays arrive strictly trick-by-trick (every trick takes exactly `seats`
 * plays), so fixed-size chunks line up with tricks. Inside a trick, anyone who
 * discarded off-suit while the led suit was live marked themselves void.
 */
export function voidMap(
  played: readonly TrickPlay[],
  seats: number,
): readonly (readonly string[])[] {
  const voids: Set<string>[] = Array.from({ length: seats }, () => new Set<string>());
  for (let start = 0; start + seats <= played.length; start += seats) {
    const chunk = played.slice(start, start + seats);
    const led = chunk.find((play) => !isSpecial(play.card))?.card;
    const ledSuit = led !== undefined ? suitOfCard(led) : null;
    if (!ledSuit) continue;
    for (const play of chunk.slice(1)) {
      const suit = suitOfCard(play.card);
      if (suit !== null && suit !== ledSuit) voids[play.seat]?.add(ledSuit);
    }
  }
  return voids.map((set) => [...set]);
}

/** Seat winning the trick AS IT STANDS (partial tricks included). */
export function currentWinner(trick: Trick | null, trumpSuit: string | null): TrickPlay | null {
  if (!trick || trick.plays.length === 0) return null;
  const seat = resolveOhHellWinner(trick, trumpSuit);
  if (seat === null) return null;
  // a seat can only play once per trick, so this finds the winning card
  return trick.plays.find((play) => play.seat === seat) ?? null;
}

/** Would playing `card` right now leave ME holding the trick? */
export function wouldWin(
  trick: Trick,
  card: CardId,
  seat: number,
  trumpSuit: string | null,
): boolean {
  const extended: Trick = { ...trick, plays: [...trick.plays, { seat, card }] };
  return resolveOhHellWinner(extended, trumpSuit) === seat;
}

/**
 * Expected tricks for a hand, per card. Wizards are sure tricks; trump cards
 * scale with rank plus a bonus for length; side-suit aces and kings are worth
 * most, middle cards almost nothing.
 */
export function bidEstimate(handCards: readonly CardId[], trumpSuit: string | null): number {
  let est = 0;
  let trumps = 0;
  for (const card of handCards) {
    if (isWizard(card)) {
      est += 1;
      continue;
    }
    if (isJester(card)) {
      est += 0.08;
      continue;
    }
    const rank = rankOfCard(card);
    const suit = suitOfCard(card);
    if (trumpSuit !== null && suit === trumpSuit) {
      trumps += 1;
      est += (rank / 14) ** 2 * 0.85;
    } else if (rank === 14) {
      est += 0.7;
    } else if (rank === 13) {
      est += 0.3;
    } else {
      est += (rank / 14) ** 3 * 0.2;
    }
  }
  est += Math.max(0, trumps - 2) * 0.25;
  return est;
}

/** The easy table's folk wisdom: aces and trumps, nothing subtler. */
export function naiveEstimate(handCards: readonly CardId[], trumpSuit: string | null): number {
  let est = 0;
  let trumps = 0;
  for (const card of handCards) {
    if (isWizard(card)) est += 1;
    else if (isJester(card)) continue;
    else if (rankOfCard(card) === 14) est += 1;
    else if (trumpSuit !== null && suitOfCard(card) === trumpSuit) trumps += 1;
  }
  return est + trumps * 0.35;
}
