import { describe, expect, it } from 'vitest';
import { aggregateWinRates, runBotGame, simulateGames } from '@parlour/engine';
import { PERSONAS, TIER_BOTS, makePersonaBot, personaById, tierBot } from './personas';
import { createBlitzDef } from '../rules';

const def = createBlitzDef();

describe('persona registry', () => {
  it('defines six named personas with unique ids and valid tiers', () => {
    expect(PERSONAS).toHaveLength(6);
    expect(new Set(PERSONAS.map((p) => p.id)).size).toBe(6);
    for (const persona of PERSONAS) {
      expect([1, 2, 3]).toContain(persona.tier);
      expect(persona.avatar.length).toBeGreaterThan(0);
      expect(persona.emotes.length).toBeGreaterThan(0);
      expect(personaById(persona.id)).toBe(persona);
    }
  });

  it('spans all three difficulty tiers', () => {
    const tiers = new Set(PERSONAS.map((p) => p.tier));
    expect([...tiers].sort()).toEqual([1, 2, 3]);
  });

  it('exposes the three tiers as plain policies', () => {
    expect(TIER_BOTS.map((b) => b.tier)).toEqual([1, 2, 3]);
    expect(tierBot(1).tier).toBe(1);
    expect(tierBot(3).tier).toBe(3);
    expect(() => tierBot(4 as 1 | 2 | 3)).toThrow(/no bot policy/);
  });

  it('rejects unknown personas', () => {
    expect(() => makePersonaBot('nobody')).toThrow(/unknown persona/);
  });
});

describe('policy legality', () => {
  it('plays full mixed-persona rounds without a single illegal move', () => {
    // runBotGame throws if any policy steps outside the legal list — this
    // doubles as an end-to-end harness check for every persona
    for (const persona of PERSONAS) {
      for (let seed = 0; seed < 12; seed++) {
        const record = runBotGame(def, {
          seed,
          policies: [makePersonaBot(persona.id), tierBot(((seed % 3) + 1) as 1 | 2 | 3)],
        });
        expect(record.result).not.toBeNull();
      }
    }
  });

  it('is deterministic for a fixed seed and seating', () => {
    const policies = [makePersonaBot('knuckles'), makePersonaBot('nan-peg')];
    expect(runBotGame(def, { seed: 5150, policies })).toEqual(
      runBotGame(def, { seed: 5150, policies }),
    );
  });
});

describe('tier separation (small-sample smoke)', () => {
  it('hard finishes ahead of easy over a few hundred games', () => {
    const records = simulateGames(def, 150, {
      baseSeed: 77_000_000,
      tolerateStalls: true,
      seatPoliciesFor: (i) => (i % 2 === 0 ? [tierBot(3), tierBot(1)] : [tierBot(1), tierBot(3)]),
      seatLabelsFor: (i) => (i % 2 === 0 ? ['hard', 'easy'] : ['easy', 'hard']),
    });
    const rows = aggregateWinRates(records, (record, seat) => {
      const label = record.labels?.[seat];
      if (!label) throw new Error('missing seat label');
      return label;
    });
    const hard = rows.find((r) => r.key === 'hard');
    const easy = rows.find((r) => r.key === 'easy');
    expect(hard).toBeDefined();
    expect(easy).toBeDefined();
    expect(hard!.winRate).toBeGreaterThan(easy!.winRate);
  }, 60_000);
});
