import type { SeatId } from './types';

/**
 * Neutral partnership mapping for team games: seats alternate around the table
 * so evens form one team and odds another — N/S vs E/W at four seats (Euchre),
 * partners-across for Spades, 3v3 at six. Games own their scores; this only
 * answers "who sits together".
 */
export interface TeamMap {
  readonly teamCount: number;
  readonly seatCount: number;
  /** 0-based team index for a seat */
  teamOf(seat: SeatId): number;
  /** seats belonging to a team, ascending by table order */
  seatsOf(team: number): readonly SeatId[];
  /** the seat sitting across from this one, or null when teams have one seat */
  partnerOf(seat: SeatId): SeatId | null;
}

export function pairedTeams(seatCount: number, teamCount = 2): TeamMap {
  if (!Number.isInteger(seatCount) || seatCount < 2) {
    throw new Error(`pairedTeams: seatCount must be an integer ≥ 2, got ${seatCount}`);
  }
  if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > seatCount) {
    throw new Error(
      `pairedTeams: teamCount must be an integer in [2, ${seatCount}], got ${teamCount}`,
    );
  }
  if (seatCount % teamCount !== 0) {
    throw new Error(
      `pairedTeams: ${seatCount} seats do not split evenly across ${teamCount} teams`,
    );
  }
  const normalized = (seat: SeatId): SeatId => ((seat % seatCount) + seatCount) % seatCount;
  return {
    teamCount,
    seatCount,
    teamOf: (seat) => normalized(seat) % teamCount,
    seatsOf(team) {
      const members: SeatId[] = [];
      for (let seat = team; seat < seatCount; seat += teamCount) members.push(seat);
      return members;
    },
    partnerOf: (seat) =>
      teamCount === seatCount ? null : (normalized(seat) + teamCount) % seatCount,
  };
}

export interface TeamStanding {
  team: number;
  score: number;
  /** 1 = best; tied scores share a rank */
  rank: number;
}

/** Ranks teams by score, highest first; ties share a rank. */
export function rankTeamStandings(
  standings: readonly { team: number; score: number }[],
): TeamStanding[] {
  const ordered = [...standings].sort((a, b) => b.score - a.score || a.team - b.team);
  return ordered.map((standing) => ({
    ...standing,
    rank: ordered.filter((other) => other.score > standing.score).length + 1,
  }));
}
