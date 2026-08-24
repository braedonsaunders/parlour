import { describe, expect, it } from 'vitest';
import { pairedTeams, rankTeamStandings } from './teams';

describe('pairedTeams', () => {
  it('maps a four-seat euchre table to N/S vs E/W', () => {
    const teams = pairedTeams(4);
    expect(teams.teamOf(0)).toBe(0);
    expect(teams.teamOf(1)).toBe(1);
    expect(teams.teamOf(2)).toBe(0);
    expect(teams.teamOf(3)).toBe(1);
    expect(teams.seatsOf(0)).toEqual([0, 2]);
    expect(teams.seatsOf(1)).toEqual([1, 3]);
    expect(teams.partnerOf(1)).toBe(3);
    expect(teams.partnerOf(2)).toBe(0);
  });

  it('supports six-seat three-team tables and single-seat teams', () => {
    const trio = pairedTeams(6, 3);
    expect(trio.seatsOf(0)).toEqual([0, 3]);
    expect(trio.seatsOf(2)).toEqual([2, 5]);
    expect(pairedTeams(4, 4).partnerOf(2)).toBeNull();
  });

  it('normalises negative and overflowing seats', () => {
    const teams = pairedTeams(4);
    expect(teams.teamOf(-1)).toBe(1);
    expect(teams.teamOf(7)).toBe(1);
    expect(teams.partnerOf(-2)).toBe(0);
  });

  it('rejects impossible splits', () => {
    expect(() => pairedTeams(1)).toThrow();
    expect(() => pairedTeams(5)).toThrow();
    expect(() => pairedTeams(6, 4)).toThrow();
    expect(() => pairedTeams(4, 5)).toThrow();
  });
});

describe('rankTeamStandings', () => {
  it('ranks by score with shared ranks for ties', () => {
    const standings = rankTeamStandings([
      { team: 0, score: 10 },
      { team: 1, score: 7 },
      { team: 2, score: 10 },
      { team: 3, score: 2 },
    ]);
    expect(standings.map((s) => [s.team, s.rank])).toEqual([
      [0, 1],
      [2, 1],
      [1, 3],
      [3, 4],
    ]);
  });
});
