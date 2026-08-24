import { describe, expect, it } from 'vitest';
import { PERSONAS, makePersonaBot } from '../bots/personas';
import { tierBot } from '../bots';
import {
  DEFAULT_THRESHOLDS,
  personaCombos,
  runBalanceGates,
  runCoverage,
  seatParityShare,
  type GateThresholds,
} from './gates';

describe('bot roster', () => {
  it('ships three distinct tiers and six personas', () => {
    expect(tierBot(1).id).not.toBe(tierBot(3).id);
    expect(PERSONAS.length).toBeGreaterThanOrEqual(4);
    expect(makePersonaBot('falco').persona.name).toBe('Falco');
  });
});

describe('balance gates', () => {
  const loose: GateThresholds = {
    ...DEFAULT_THRESHOLDS,
    headToHeadMin: 0,
    personaBandMin: 0,
    personaBandMax: 1,
    symmetryBandMin: 0,
    symmetryBandMax: 1,
  };

  it('runs a small mixed batch without stalling', () => {
    const report = runBalanceGates({ games: 4, baseSeed: 11, thresholds: loose });
    expect(report.stalls).toBe(0);
    expect(report.headToHead.games).toBe(4);
    expect(report.personas.rows.length).toBeGreaterThan(0);
    expect(report.personas.rows.length).toBe(PERSONAS.length);
  }, 30_000);

  it('keeps the default threshold set strict', () => {
    expect(DEFAULT_THRESHOLDS.headToHeadMin).toBeGreaterThanOrEqual(0.55);
    expect(DEFAULT_THRESHOLDS.maxStallRate).toBeLessThanOrEqual(0.01);
    // a wide-but-real band: personas may lean but must stay competitive
    expect(DEFAULT_THRESHOLDS.personaBandMax - DEFAULT_THRESHOLDS.personaBandMin).toBeGreaterThan(
      0.4,
    );
  });
});

describe('helpers', () => {
  it('builds every 4-persona combination of the roster exactly once', () => {
    const combos = personaCombos(4);
    const seen = new Set(combos.map((combo) => combo.join('|')));
    expect(seen.size).toBe(combos.length);
    for (const combo of combos) {
      expect(combo).toHaveLength(4);
      for (const id of combo) {
        expect(PERSONAS.some((persona) => persona.id === id)).toBe(true);
      }
    }
  });

  it('credits even seats half a win per partnership victory', () => {
    const result = { winner: 0, rankings: [], reason: 'test' };
    const share = seatParityShare(
      [
        { seed: 1, seats: 4, events: 10, result, winners: [0, 2], stalled: false },
        { seed: 2, seats: 2, events: 10, result, winners: [1], stalled: false },
      ],
      0,
    );
    expect(share).toBeCloseTo(0.5); // (2/2 + 0/1) / 2 games
  });
});

describe('coverage sweep', () => {
  it('finishes small batches across all seat counts and presets', () => {
    const report = runCoverage({ rounds: 2, baseSeed: 5_005 });
    expect(report.stalls).toBe(0);
    expect(report.rows.map((row) => row.seats)).toEqual(expect.arrayContaining([2, 3, 4, 6]));
    expect(report.rows.every((row) => row.ended === row.games)).toBe(true);
  }, 30_000);
});
