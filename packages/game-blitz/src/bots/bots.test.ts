import { describe, expect, it } from 'vitest';
import {
  aggregateWinRates,
  chooseBotMove,
  makeRng,
  runBotGame,
  simulateGames,
} from '@parlour/engine';
import { PERSONAS, TIER_BOTS, makePersonaBot, personaById, tierBot } from './personas';
import { blitzConfigSchema } from '../config';
import { createBlitzDef } from '../rules';
import type { BlitzState } from '../state';

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

  it('makes the same hard choice from the same view, legal moves, and rng', () => {
    const view: BlitzState = {
      rules: blitzConfigSchema.defaults(),
      seats: 2,
      hands: [
        ['S1', 'S10', 'H2'],
        ['C2', 'C3', 'C4'],
      ],
      stock: ['D2'],
      discard: ['S9'],
      turn: 0,
      knocker: 1,
      postKnockTurns: 1,
      drawnFromDiscard: null,
      pickups: [],
      outcome: null,
      veiled: false,
    };
    const legal = [{ id: 'draw.stock' }, { id: 'draw.discard' }];
    const bot = makePersonaBot('poker-pat');
    const previous = process.env.DESP_RESCUE;

    try {
      process.env.DESP_RESCUE = '100';
      const first = chooseBotMove(bot, view, 0, legal, makeRng(90210));
      process.env.DESP_RESCUE = '0';
      const second = chooseBotMove(bot, view, 0, legal, makeRng(90210));

      expect(second).toEqual(first);
    } finally {
      if (previous === undefined) delete process.env.DESP_RESCUE;
      else process.env.DESP_RESCUE = previous;
    }
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
