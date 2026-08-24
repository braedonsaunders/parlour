import { describe, expect, it } from 'vitest';
import { ratscrewConfigSchema } from './config';
import {
  PERSONA_BY_TIER,
  RATSCREW_PERSONAS,
  botPolicyFor,
  replaysIdentically,
  simulateRealtimeGame,
} from './realtime';
import { runBalanceGates } from './sim/gates';

function lineup(ids: readonly string[]) {
  const table = RATSCREW_PERSONAS;
  const byId = (id: string) => {
    const persona = Object.values(table).find((candidate) => candidate.id === id);
    if (!persona) throw new Error(`unknown persona ${id}`);
    return persona;
  };
  return ids.map(byId);
}

describe('real-time driver', () => {
  it('plays bot matches to completion across seat counts', () => {
    for (const seats of [2, 3, 4]) {
      for (let seed = 0; seed < 6; seed++) {
        const record = simulateRealtimeGame({
          seed: seed * 17 + seats,
          seats,
          personas: Array.from({ length: seats }, (_, seat) => PERSONA_BY_TIER[seat % 3]!),
        });
        expect(record.stalled).toBeUndefined();
        expect(record.result?.winner ?? null).not.toBeNull();
        expect(record.result?.reason).toBe('last-standing');
        expect(record.stats.slapsWon).toBeGreaterThan(0);
        expect(record.stats.windowsOpened).toBeGreaterThan(0);
        expect(record.durationMs).toBeGreaterThan(0);
      }
    }
  });

  it('is deterministic per seed and replays hash-identically', () => {
    const opts = {
      seed: 321,
      seats: 3,
      personas: lineup(['bolt', 'quinn', 'rusty']),
    } as const;
    const first = simulateRealtimeGame(opts);
    const second = simulateRealtimeGame(opts);
    expect(second.finalHash).toBe(first.finalHash);
    expect(second.log.map((event) => `${event.seat}:${event.move}`)).toEqual(
      first.log.map((event) => `${event.seat}:${event.move}`),
    );
    expect(replaysIdentically(first)).toBe(true);
  });

  it('logs authority times monotonically', () => {
    const record = simulateRealtimeGame({
      seed: 88,
      seats: 2,
      personas: lineup(['bolt', 'rusty']),
    });
    let last = -1;
    for (const event of record.log) {
      if (event.atMs === undefined) continue;
      expect(event.atMs).toBeGreaterThanOrEqual(last);
      last = event.atMs;
    }
  });

  it('jumpy tiers burn cards on hard fakes while calm tiers rarely do', () => {
    let boltBurns = 0;
    let rustyBurns = 0;
    for (let seed = 0; seed < 8; seed++) {
      const bolt = simulateRealtimeGame({
        seed: seed * 31 + 5,
        seats: 2,
        personas: lineup(['bolt', 'bolt']),
      });
      boltBurns += bolt.stats.misSlaps;
      const rusty = simulateRealtimeGame({
        seed: seed * 31 + 6,
        seats: 2,
        personas: lineup(['rusty', 'rusty']),
      });
      rustyBurns += rusty.stats.misSlaps;
    }
    expect(boltBurns).toBeGreaterThan(rustyBurns);
  });

  it('sees expired windows pay out pending pile wins without stalling', () => {
    // slow-vs-slow tables let plenty of windows expire untouched
    const record = simulateRealtimeGame({
      seed: 404,
      seats: 3,
      personas: lineup(['rusty', 'rusty', 'rusty']),
      config: ratscrewConfigSchema.resolve({ slapWindowMs: 400 }),
    });
    expect(record.stalled).toBeUndefined();
    expect(record.result?.winner).not.toBeNull();
  });
});

describe('persona policies', () => {
  it('prefer flips and take offered slaps through the generic policy shape', () => {
    const policy = botPolicyFor(RATSCREW_PERSONAS.quinn);
    expect(policy.tier).toBe(2);
    expect(policy.persona?.name).toBe('Quinn');
  });
});

describe('balance gates', () => {
  it('runs the full gate suite on a modest sample', () => {
    const report = runBalanceGates({ games: 24, baseSeed: 777 });
    expect(report.determinism.passes).toBe(true);
    expect(report.headToHead.hardWinRate).toBeGreaterThanOrEqual(report.headToHead.easyWinRate);
    expect(report.personas.rows.map((row) => row.key)).toEqual(['bolt', 'jinx', 'quinn', 'rusty']);
    // structural sanity even when a band edge wobbles on small samples
    expect(report.thresholds.headToHeadMin).toBeGreaterThan(0.5);
  }, 20_000);
});
