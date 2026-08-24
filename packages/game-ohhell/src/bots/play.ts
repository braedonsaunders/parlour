import type { CardId, Rng } from '@parlour/engine';
import { isJester, isWizard, rankOfCard, suitOfCard } from '../cards';
import type { OhHellState } from '../state';
import { bidEstimate, naiveEstimate, ownHand, voidMap, wouldWin } from './evaluate';

export interface BidParams {
  /** use the per-card power model instead of the aces-and-trump folk count */
  counter: boolean;
  /** added to the raw estimate before rounding — positive over-bids, negative sandbags */
  aggression: number;
  jitter: number;
  /** as (probable) last bidder, steer clear of making every bid come out exact */
  hookAware: boolean;
}

export interface PlayParams {
  /** easy tables: follow at random among legal cards */
  random: boolean;
  /** try to win while under bid; duck once level */
  chase: boolean;
  /** when ducking, deliberately shed cards that cannot win */
  dumpLosers: boolean;
  /** discount chases later players can ruff (they are known void in the led suit) */
  voidAware: boolean;
  /** never spend a Wizard while any other legal card would do */
  holdWizards: boolean;
}

export function decideBid(
  view: OhHellState,
  seat: number,
  candidates: readonly number[],
  params: BidParams,
  rng: Rng,
): number {
  if (candidates.length === 0) return 0;
  const handCards = ownHand(view, seat);
  const est = params.counter
    ? bidEstimate(handCards, view.trumpSuit)
    : naiveEstimate(handCards, view.trumpSuit);
  let target = Math.round(
    est + params.aggression + (params.jitter === 0 ? 0 : (rng.float() - 0.5) * params.jitter),
  );
  target = Math.min(view.handSize, Math.max(0, target));

  if (params.hookAware && view.rules.hookRule && seat === view.dealer) {
    let others = 0;
    for (let other = 0; other < view.seats; other++) {
      if (other !== seat) others += view.bids[other] ?? 0;
    }
    const forbidden = view.handSize - others;
    // Slide off the forbidden value toward whichever side of it my hand
    // actually lives on — a strong hand steps UP, a weak one down.
    if (target === forbidden) {
      target =
        est >= forbidden ? Math.min(view.handSize, forbidden + 1) : Math.max(0, forbidden - 1);
    }
  }

  return candidates.reduce((best, value) =>
    Math.abs(value - target) < Math.abs(best - target) ? value : best,
  );
}

function lowestRank(cards: readonly CardId[]): CardId | null {
  return [...cards].sort((a, b) => rankOfCard(a) - rankOfCard(b))[0] ?? null;
}

/**
 * Card selection for one trick slot. The through-line of every tier above
 * random: count tricks taken against the bid. Under — compete for the trick
 * with the CHEAPEST card that wins; level or over — shed the most dangerous
 * card that still loses.
 */
export function decidePlay(
  view: OhHellState,
  seat: number,
  cards: readonly CardId[],
  params: PlayParams,
  rng: Rng,
): CardId {
  if (cards.length === 1) return cards[0]!;
  if (params.random) return rng.pick([...cards]);

  const trump = view.trumpSuit;
  const taken = view.tricksWon[seat] ?? 0;
  const bid = view.bids[seat] ?? 0;
  const trick = view.trick;
  const leading = !trick || trick.plays.length === 0;
  const needTricks = taken < bid;

  const plain = () =>
    [...cards]
      .filter((card) => !isWizard(card) && !isJester(card))
      .sort((a, b) => rankOfCard(a) - rankOfCard(b));
  const wizards = cards.filter(isWizard);

  if (leading) {
    if (!needTricks) {
      // Dump mode: a Jester lead loses to everything; otherwise the lowest
      // plain card. Wizards are never thrown away while dumping.
      return cards.find(isJester) ?? plain()[0] ?? cards[0]!;
    }
    return plain().at(-1) ?? wizards[0] ?? cards[0]!;
  }

  if (!trick) return plain()[0] ?? cards[0]!; // unreachable; keeps narrowing honest
  const winners = cards.filter((card) => wouldWin(trick, card, seat, trump));
  const losers = cards.filter((card) => !winners.includes(card));

  if (needTricks && params.chase && winners.length > 0) {
    let pool = winners;
    if (params.voidAware) {
      // Anyone yet to act who is void in the led suit may ruff my plain winner.
      const led = trick.ledSuit;
      const playedSeats = new Set(trick.plays.map((play) => play.seat));
      const voids = voidMap(view.played, view.seats);
      const voidsBehind = voids.filter(
        (suits, playerSeat) =>
          !playedSeats.has(playerSeat) &&
          playerSeat !== seat &&
          led !== null &&
          suits.includes(led),
      ).length;
      if (voidsBehind > 0 && trump !== null) {
        const ruffProof = pool.filter((card) => isWizard(card) || suitOfCard(card) === trump);
        // Only chase through a possible ruff with a sure thing; otherwise wait.
        pool = ruffProof.length > 0 ? ruffProof : [];
      }
    }
    if (params.holdWizards && pool.length > 0) {
      const cheapPlain = lowestRank(pool.filter((card) => !isWizard(card)));
      if (cheapPlain) return cheapPlain;
      // A Wizard is spent only out of desperation: needing 2+ more tricks, or
      // the final chance to reach the bid.
      const desperate = bid - taken >= 2 || view.handSize - view.tricksPlayed === 1;
      if (!desperate) pool = [];
    }
    const cheap = lowestRank(pool);
    if (cheap) return cheap;
  }

  if (params.dumpLosers && losers.length > 0) {
    // Shed the highest loser: it cannot win here, and it should not survive to
    // a later trick where it might cost one.
    const dumpable = losers.filter((card) => !isJester(card));
    const pool = dumpable.length > 0 ? dumpable : losers;
    return [...pool].sort((a, b) => rankOfCard(b) - rankOfCard(a))[0]!;
  }

  return plain()[0] ?? cards[0]!;
}
