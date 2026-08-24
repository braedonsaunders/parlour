import type { SeatId } from '@parlour/engine';
import { BAG_LIMIT, BAG_PENALTY, NIL_SCORE, type SpadesRules } from './config';
import { seatsOf, teamOf } from './cards';
import type { HandSummary, SpadesBid, TeamHandScore } from './state';

export interface ScoreInput {
  handNo: number;
  dealer: SeatId;
  bids: readonly SpadesBid[];
  tricksBySeat: readonly number[];
  priorScores: readonly [number, number];
  priorBags: readonly [number, number];
  rules: Pick<SpadesRules, 'nil' | 'bags'>;
}

function bidOf(bids: readonly SpadesBid[], seat: SeatId): SpadesBid | undefined {
  return bids.find((bid) => bid.seat === seat);
}

function sumSeats(seats: readonly SeatId[], value: (seat: SeatId) => number): number {
  return seats.reduce((total, seat) => total + value(seat), 0);
}

export function teamContract(bids: readonly SpadesBid[], team: 0 | 1): number {
  return sumSeats(seatsOf(team), (seat) => {
    const bid = bidOf(bids, seat);
    if (!bid || bid.nil) return 0;
    return bid.tricks;
  });
}

export function teamNonNilTricks(
  bids: readonly SpadesBid[],
  tricksBySeat: readonly number[],
  team: 0 | 1,
): number {
  return sumSeats(seatsOf(team), (seat) => {
    const bid = bidOf(bids, seat);
    if (!bid || bid.nil) return 0;
    return tricksBySeat[seat] ?? 0;
  });
}

export function teamNilTricks(
  bids: readonly SpadesBid[],
  tricksBySeat: readonly number[],
  team: 0 | 1,
): number {
  return sumSeats(seatsOf(team), (seat) => {
    const bid = bidOf(bids, seat);
    if (!bid || !bid.nil) return 0;
    return tricksBySeat[seat] ?? 0;
  });
}

export function scoreTeam(
  bids: readonly SpadesBid[],
  tricksBySeat: readonly number[],
  team: 0 | 1,
  priorScore: number,
  priorBags: number,
  rules: Pick<SpadesRules, 'nil' | 'bags'>,
): TeamHandScore {
  const contract = teamContract(bids, team);
  const nonNilTricks = teamNonNilTricks(bids, tricksBySeat, team);
  const nilTricks = teamNilTricks(bids, tricksBySeat, team);
  const made = nonNilTricks >= contract;
  const overtricks = made ? nonNilTricks - contract : 0;
  const overtrickPoints = made && rules.bags ? overtricks : 0;
  const contractDelta = made ? 10 * contract + overtrickPoints : -10 * contract;

  let nilDelta = 0;
  let failedNilBags = 0;
  for (const seat of seatsOf(team)) {
    const bid = bidOf(bids, seat);
    if (!bid || !bid.nil || !rules.nil) continue;
    const taken = tricksBySeat[seat] ?? 0;
    if (taken === 0) nilDelta += NIL_SCORE;
    else {
      nilDelta -= NIL_SCORE;
      failedNilBags += taken;
    }
  }

  // Failed-nil tricks are bags AND +1 each, even when the contract is set.
  const failedNilBagPoints = rules.bags ? failedNilBags : 0;
  const bagsTaken = overtrickPoints + failedNilBagPoints;
  const bagTotal = priorBags + bagsTaken;
  const cycles = rules.bags ? Math.floor(bagTotal / BAG_LIMIT) : 0;
  const bagPenalty = cycles * BAG_PENALTY;
  const bagsAfter = rules.bags ? bagTotal - cycles * BAG_LIMIT : priorBags;
  const delta = contractDelta + nilDelta + failedNilBagPoints - bagPenalty;

  return {
    team,
    contract,
    nonNilTricks,
    nilTricks,
    made,
    contractDelta,
    nilDelta,
    overtricks,
    bagsTaken,
    bagPenalty,
    delta,
    scoreAfter: priorScore + delta,
    bagsAfter,
  };
}

export function scoreHand(input: ScoreInput): {
  summary: HandSummary;
  scores: readonly [number, number];
  bags: readonly [number, number];
} {
  const team0 = scoreTeam(
    input.bids,
    input.tricksBySeat,
    0,
    input.priorScores[0],
    input.priorBags[0],
    input.rules,
  );
  const team1 = scoreTeam(
    input.bids,
    input.tricksBySeat,
    1,
    input.priorScores[1],
    input.priorBags[1],
    input.rules,
  );
  return {
    summary: {
      handNo: input.handNo,
      dealer: input.dealer,
      bids: [...input.bids],
      tricksBySeat: [...input.tricksBySeat],
      teams: [team0, team1],
    },
    scores: [team0.scoreAfter, team1.scoreAfter],
    bags: [team0.bagsAfter, team1.bagsAfter],
  };
}

/** True when one team uniquely leads at or above the target after a hand. */
export function matchOver(
  scores: readonly [number, number],
  target: number,
): { winner: 0 | 1 } | null {
  const reached = scores[0] >= target || scores[1] >= target;
  if (!reached || scores[0] === scores[1]) return null;
  return { winner: scores[0] > scores[1] ? 0 : 1 };
}

export function matchResult(
  scores: readonly [number, number],
  bags: readonly [number, number],
  target: number,
): {
  winner: SeatId;
  rankings: { seat: SeatId; rank: number; detail: Record<string, number> }[];
  reason: string;
} | null {
  const over = matchOver(scores, target);
  if (!over) return null;
  const losing: 0 | 1 = over.winner === 0 ? 1 : 0;
  const seats = (team: 0 | 1): SeatId[] => [...seatsOf(team)];
  return {
    winner: seats(over.winner)[0]!,
    rankings: [
      ...seats(over.winner).map((seat) => ({
        seat,
        rank: 1,
        detail: { team: over.winner, score: scores[over.winner], bags: bags[over.winner] },
      })),
      ...seats(losing).map((seat) => ({
        seat,
        rank: 2,
        detail: { team: losing, score: scores[losing], bags: bags[losing] },
      })),
    ],
    reason: `first to ${target}`,
  };
}

export { teamOf };
