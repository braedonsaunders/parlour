import type { SeatId } from '@parlour/engine';
import { seatsOf, teamOf } from './cards';
import type { PinochleRules } from './config';
import type { MeldBreakdown } from './meld';
import type { HandSummary, TeamHandScore } from './state';

export interface ScoreHandInput {
  handNo: number;
  dealer: SeatId;
  bidWinner: SeatId;
  bid: number;
  trump: HandSummary['trump'];
  meldBySeat: readonly [MeldBreakdown, MeldBreakdown, MeldBreakdown, MeldBreakdown];
  tricksBySeat: readonly [number, number, number, number];
  trickPointsBySeat: readonly [number, number, number, number];
  priorScores: readonly [number, number];
  rules: Pick<PinochleRules, 'opponentsScoreMeld'>;
}

function sumSeats(seats: readonly SeatId[], value: (seat: SeatId) => number): number {
  return seats.reduce((total, seat) => total + value(seat), 0);
}

/**
 * Scores one completed hand. The bidding team's meld only counts if their
 * meld + trick points reach the bid — falling short sets them for exactly
 * minus the bid, meld included in that loss. The non-bidding team always
 * scores their trick points, and their meld too unless the table has turned
 * `opponentsScoreMeld` off.
 */
export function scoreHand(input: ScoreHandInput): {
  summary: HandSummary;
  scores: readonly [number, number];
} {
  const bidTeam = teamOf(input.bidWinner);
  const opponentTeam: 0 | 1 = bidTeam === 0 ? 1 : 0;

  const meldByTeam = (team: 0 | 1): number =>
    sumSeats(seatsOf(team), (seat) => input.meldBySeat[seat]?.total ?? 0);
  const trickPointsByTeam = (team: 0 | 1): number =>
    sumSeats(seatsOf(team), (seat) => input.trickPointsBySeat[seat] ?? 0);

  const bidRaw = meldByTeam(bidTeam) + trickPointsByTeam(bidTeam);
  const made = bidRaw >= input.bid;
  const bidTeamDelta = made ? bidRaw : -input.bid;

  const opponentMeld = input.rules.opponentsScoreMeld ? meldByTeam(opponentTeam) : 0;
  const opponentDelta = trickPointsByTeam(opponentTeam) + opponentMeld;

  const teamScore = (team: 0 | 1): TeamHandScore => {
    const isBidTeam = team === bidTeam;
    const delta = isBidTeam ? bidTeamDelta : opponentDelta;
    return {
      team,
      meld: isBidTeam ? meldByTeam(team) : opponentMeld,
      trickPoints: trickPointsByTeam(team),
      raw: isBidTeam ? bidRaw : opponentDelta,
      isBidTeam,
      bid: isBidTeam ? input.bid : null,
      made: isBidTeam ? made : null,
      delta,
      scoreAfter: input.priorScores[team] + delta,
    };
  };

  const team0 = teamScore(0);
  const team1 = teamScore(1);
  const summary: HandSummary = {
    handNo: input.handNo,
    dealer: input.dealer,
    bidWinner: input.bidWinner,
    bidTeam,
    bid: input.bid,
    trump: input.trump,
    meldBySeat: input.meldBySeat,
    tricksBySeat: input.tricksBySeat,
    trickPointsBySeat: input.trickPointsBySeat,
    teams: [team0, team1],
    set: !made,
  };
  return { summary, scores: [team0.scoreAfter, team1.scoreAfter] };
}

/**
 * A hand result: `null` if neither team has reached target yet. When both
 * cross in the same hand, the bidding team wins the match unless they were
 * set — a set bidding team instead loses the tie-break to the higher score,
 * with the bidder winning any remaining tie.
 */
export function matchOver(
  scores: readonly [number, number],
  target: number,
  bidTeam: 0 | 1,
  wasSet: boolean,
): { winner: 0 | 1 } | null {
  const over0 = scores[0] >= target;
  const over1 = scores[1] >= target;
  if (!over0 && !over1) return null;
  if (over0 && over1) {
    if (!wasSet) return { winner: bidTeam };
    if (scores[0] !== scores[1]) return { winner: scores[0] > scores[1] ? 0 : 1 };
    return { winner: bidTeam };
  }
  return { winner: over0 ? 0 : 1 };
}

export function matchResult(
  scores: readonly [number, number],
  target: number,
  bidTeam: 0 | 1,
  wasSet: boolean,
): {
  winner: SeatId;
  rankings: { seat: SeatId; rank: number; detail: Record<string, number> }[];
  reason: string;
} | null {
  const over = matchOver(scores, target, bidTeam, wasSet);
  if (!over) return null;
  const losing: 0 | 1 = over.winner === 0 ? 1 : 0;
  const seats = (team: 0 | 1): SeatId[] => [...seatsOf(team)];
  return {
    winner: seats(over.winner)[0]!,
    rankings: [
      ...seats(over.winner).map((seat) => ({
        seat,
        rank: 1,
        detail: { team: over.winner, score: scores[over.winner] },
      })),
      ...seats(losing).map((seat) => ({
        seat,
        rank: 2,
        detail: { team: losing, score: scores[losing] },
      })),
    ],
    reason: `first to ${target}`,
  };
}

export { teamOf };
