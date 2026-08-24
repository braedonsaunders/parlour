import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, runBalanceGates } from './gates';
import { RATSCREW_PERSONAS } from '../realtime';

describe('ratscrew balance gates', () => {
  it('keeps calibrated default thresholds', () => {
    expect(DEFAULT_THRESHOLDS.headToHeadMin).toBeGreaterThan(0.5);
    expect(DEFAULT_THRESHOLDS.personaBandMin).toBeLessThan(0.15);
    expect(DEFAULT_THRESHOLDS.personaBandMax).toBeGreaterThan(0.5);
  });

  it('produces a deterministic report for a fixed seed', () => {
    const opts = {
      games: 4,
      baseSeed: 20260824,
      thresholds: { headToHeadMin: 0, personaBandMin: 0, personaBandMax: 1 },
    };
    const a = runBalanceGates(opts);
    const b = runBalanceGates(opts);
    expect(a.headToHead.hardWinRate).toBe(b.headToHead.hardWinRate);
    expect(a.personas.rows.map((row) => row.winRate)).toEqual(
      b.personas.rows.map((row) => row.winRate),
    );
    expect(a.determinism.passes).toBe(true);
    expect(a.thresholds).toEqual({ ...DEFAULT_THRESHOLDS, ...opts.thresholds });
  }, 60_000);

  it('covers every house persona in a mixed sample', () => {
    const report = runBalanceGates({
      games: 4,
      baseSeed: 11,
      thresholds: { headToHeadMin: 0, personaBandMin: 0, personaBandMax: 1 },
    });
    const keys = new Set(report.personas.rows.map((row) => row.key));
    for (const persona of Object.values(RATSCREW_PERSONAS)) {
      expect(keys.has(persona.id)).toBe(true);
    }
    expect(report.determinism.samples).toBeGreaterThan(0);
  }, 60_000);
});
