import { advanceSeat, seatOrder, type SeatId } from '@parlour/engine';
import { compareHands, type HandRank } from './evaluate';

export interface SidePot {
  /** chips in this layer */
  amount: number;
  /** seats that may win it — folded money is in the pot, folded seats are not */
  eligible: readonly SeatId[];
}

export interface PotAward {
  seat: SeatId;
  amount: number;
  /** index into the pot list this came from; 0 is the main pot */
  potIndex: number;
  /** true when the chip came from an odd-chip remainder rather than a share */
  oddChip: boolean;
}

/**
 * Splits everything wagered this hand into a main pot and its side pots.
 *
 * The layers come from the distinct amounts seats put in, not from who is
 * all-in: a seat that folded after committing 300 still built the floor of the
 * pot up to 300, it simply cannot win any of it. Getting that wrong is the
 * classic short-stack bug, where a folded player's chips vanish or a covered
 * all-in wins money it could never have called.
 */
export function buildPots(contributions: readonly number[], folded: readonly boolean[]): SidePot[] {
  const levels = [...new Set(contributions.filter((amount) => amount > 0))].sort(
    (left, right) => left - right,
  );

  const pots: SidePot[] = [];
  let floor = 0;

  for (const level of levels) {
    const layer = level - floor;
    const contributors = contributions.filter((amount) => amount >= level).length;
    const amount = layer * contributors;
    floor = level;
    if (amount <= 0) continue;

    const eligible = contributions
      .map((amount, seat) => ({ amount, seat }))
      .filter(({ amount, seat }) => amount >= level && !folded[seat])
      .map(({ seat }) => seat);

    // Consecutive layers with the same claimants are one pot as far as any
    // player is concerned; merging keeps the table from showing "side pot 3"
    // when there is only ever one contest.
    const previous = pots[pots.length - 1];
    if (previous && sameSeats(previous.eligible, eligible)) {
      pots[pots.length - 1] = { amount: previous.amount + amount, eligible };
      continue;
    }
    pots.push({ amount, eligible });
  }

  return pots;
}

function sameSeats(left: readonly SeatId[], right: readonly SeatId[]): boolean {
  return left.length === right.length && left.every((seat, index) => seat === right[index]);
}

/** Total chips across every pot — what the table displays as "the pot". */
export function potTotal(pots: readonly SidePot[]): number {
  return pots.reduce((sum, pot) => sum + pot.amount, 0);
}

/**
 * Seats in the order chips are owed to them: first to the left of the button.
 *
 * Odd chips cannot be split, and handing them out by seat index would quietly
 * favour seat 0 for a whole match. The table rule is the one implemented here.
 */
function payoutOrder(button: SeatId, seats: number): SeatId[] {
  return seatOrder(advanceSeat(button, seats), seats);
}

/**
 * Awards every pot to the best eligible hand, splitting ties.
 *
 * `ranks[seat]` is null for a seat with no hand to show — folded, busted, or
 * never dealt in. A pot whose eligible set has exactly one seat is that seat's
 * uncalled bet coming back, and falls out of the same path.
 */
export function awardPots(
  pots: readonly SidePot[],
  ranks: readonly (HandRank | null)[],
  button: SeatId,
  seats: number,
): { payouts: number[]; awards: PotAward[] } {
  const payouts = Array.from({ length: seats }, () => 0);
  const awards: PotAward[] = [];
  const order = payoutOrder(button, seats);

  pots.forEach((pot, potIndex) => {
    const contenders = pot.eligible.filter((seat) => ranks[seat]);
    if (contenders.length === 0) return;

    const best = contenders.reduce((leader, seat) =>
      compareHands(ranks[seat] as HandRank, ranks[leader] as HandRank) > 0 ? seat : leader,
    );
    const winners = contenders.filter(
      (seat) => compareHands(ranks[seat] as HandRank, ranks[best] as HandRank) === 0,
    );

    const share = Math.floor(pot.amount / winners.length);
    for (const seat of winners) {
      if (share <= 0) continue;
      payouts[seat] = (payouts[seat] as number) + share;
      awards.push({ seat, amount: share, potIndex, oddChip: false });
    }

    let remainder = pot.amount - share * winners.length;
    for (const seat of order) {
      if (remainder <= 0) break;
      if (!winners.includes(seat)) continue;
      payouts[seat] = (payouts[seat] as number) + 1;
      awards.push({ seat, amount: 1, potIndex, oddChip: true });
      remainder -= 1;
    }
  });

  return { payouts, awards };
}

/**
 * Everything folded to one seat: they take the pot without showing.
 *
 * Kept separate from {@link awardPots} because there is no hand to compare and
 * no side pot to build — a walk is not a showdown with one contender.
 */
export function awardUncontested(
  pots: readonly SidePot[],
  winner: SeatId,
  seats: number,
): { payouts: number[]; awards: PotAward[] } {
  const payouts = Array.from({ length: seats }, () => 0);
  const total = potTotal(pots);
  payouts[winner] = total;
  return {
    payouts,
    awards: total > 0 ? [{ seat: winner, amount: total, potIndex: 0, oddChip: false }] : [],
  };
}
