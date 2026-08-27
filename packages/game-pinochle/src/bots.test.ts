import { describe, expect, it } from 'vitest';
import { runBotGame } from '@parlour/engine';
import { TIER_BOTS, tierBot } from './bots';
import { PERSONAS, makePersonaBot } from './bots/personas';
import { pinochleConfig } from './config';
import { createPinochleDef } from './rules';

describe('bot roster', () => {
  it('ships three distinct tiers', () => {
    expect(TIER_BOTS).toHaveLength(3);
    expect(tierBot(1).id).not.toBe(tierBot(3).id);
  });

  it('ships at least six named personas with full meta', () => {
    expect(PERSONAS.length).toBeGreaterThanOrEqual(6);
    for (const persona of PERSONAS) {
      const bot = makePersonaBot(persona.id);
      expect(bot.persona?.name).toBe(persona.name);
    }
  });
});

describe('a bot-driven match', () => {
  it('plays to completion with both partners ranked first', () => {
    const record = runBotGame(createPinochleDef(), {
      seed: 99,
      policies: [tierBot(2), tierBot(2), tierBot(2), tierBot(2)],
      config: pinochleConfig.resolve({ target: 100 }),
      maxEvents: 6_000,
    });
    expect(record.result).not.toBeNull();
    const winners = record
      .result!.rankings.filter((r) => r.rank === 1)
      .map((r) => r.seat)
      .sort();
    expect(winners).toHaveLength(2);
    expect(winners[1]! - winners[0]!).toBe(2);
  });

  it('mixed persona tables never stall', () => {
    const record = runBotGame(createPinochleDef(), {
      seed: 100,
      policies: [
        makePersonaBot('gert'),
        makePersonaBot('vinny'),
        makePersonaBot('dot'),
        makePersonaBot('roxie'),
      ],
      config: pinochleConfig.resolve({ target: 100 }),
      maxEvents: 6_000,
    });
    expect(record.result).not.toBeNull();
  });
});
