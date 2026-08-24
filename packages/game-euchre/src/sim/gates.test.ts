import { describe, expect, it } from 'vitest';
import { euchreConfig } from '../config';
import { PERSONAS, makePersonaBot } from '../bots/personas';
import { tierBot } from '../bots';
import { DEFAULT_THRESHOLDS, runBalanceGates, teamWinShare, type GateThresholds } from './gates';

describe('bot roster', () => {
  it('ships three distinct tiers', () => {
    expect(tierBot(1).tier).toBe(1);
    expect(tierBot(2).tier).toBe(2);
    expect(tierBot(3).tier).toBe(3);
    const ids = new Set([tierBot(1).id, tierBot(2).id, tierBot(3).id]);
    expect(ids.size).toBe(3);
  });

  it('backs every persona with avatar/emote meta for seat plaques', () => {
    expect(PERSONAS.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(PERSONAS.map((persona) => persona.id));
    expect(ids.size).toBe(PERSONAS.length);
    for (const persona of PERSONAS) {
      const policy = makePersonaBot(persona.id);
      expect(policy.persona.name).toBeTruthy();
      expect(policy.persona.avatar).toBeTruthy();
      expect(policy.persona.emotes.length).toBeGreaterThan(0);
      expect(policy.tier).toBe(persona.tier);
    }
    expect(() => makePersonaBot('nobody')).toThrow(/unknown persona/);
  });
});

describe('balance gates', () => {
  const quick: GateThresholds = {
    ...DEFAULT_THRESHOLDS,
    // small-sample runs stay deterministic; only structure is asserted here
    headToHeadMin: 0,
    personaBandMin: 0,
    personaBandMax: 1,
    symmetryBandMin: 0,
    symmetryBandMax: 1,
  };

  it('runs deterministically for a given seed', () => {
    const a = runBalanceGates({ games: 12, baseSeed: 5, thresholds: quick });
    const b = runBalanceGates({ games: 12, baseSeed: 5, thresholds: quick });
    expect(a.headToHead.hardWinRate).toBe(b.headToHead.hardWinRate);
    expect(a.symmetry.teamZeroShare).toBe(b.symmetry.teamZeroShare);
    expect(a.personas.rows.map((row) => row.winRate)).toEqual(
      b.personas.rows.map((row) => row.winRate),
    );
  });

  it('covers every persona and reports all gates', () => {
    const report = runBalanceGates({ games: 12, baseSeed: 9, thresholds: quick });
    expect(report.personas.rows.map((row) => row.key).sort()).toEqual(
      [...PERSONAS.map((persona) => persona.id)].sort(),
    );
    expect(report.headToHead.games).toBe(12);
    expect(report.stalls).toBe(0);
  });

  it('keeps the full default threshold set strict', () => {
    expect(DEFAULT_THRESHOLDS.headToHeadMin).toBeGreaterThanOrEqual(0.55);
    expect(DEFAULT_THRESHOLDS.maxStallRate).toBeLessThanOrEqual(0.01);
    expect(euchreConfig.defaults().targetScore).toBe(10);
  });
});

describe('teamWinShare', () => {
  it('credits half a win to each partner and skips abandoned matches', () => {
    const result = { winner: 0, rankings: [], reason: 'test' };
    const share = teamWinShare(
      [
        { seed: 1, seats: 4, events: 10, result, winners: [0, 2], stalled: false },
        { seed: 2, seats: 4, events: 10, result, winners: [1, 3], stalled: false },
        { seed: 3, seats: 0, events: 10, result: null, winners: [], stalled: true },
      ],
      0,
    );
    expect(share).toBeCloseTo(0.5);
  });

  it('returns null when nothing finished', () => {
    expect(teamWinShare([], 1)).toBeNull();
  });
});
