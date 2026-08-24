import { describe, expect, it } from 'vitest';
import { runBotGame } from '@parlour/engine';
import { TIER_BOTS, chooseFromProfile, profileForTier, tierBot } from './bots';
import { PERSONAS, makePersonaBot } from './bots/personas';
import { spadesConfig } from './config';
import { createSpadesDef, spadesGame } from './game';
import { openSession } from './test-util';

describe('bot roster', () => {
  it('ships three distinct tiers', () => {
    expect(tierBot(1).tier).toBe(1);
    expect(tierBot(2).tier).toBe(2);
    expect(tierBot(3).tier).toBe(3);
    expect(new Set(TIER_BOTS.map((bot) => bot.id)).size).toBe(3);
  });

  it('backs every persona with avatar/emote meta', () => {
    expect(PERSONAS.length).toBeGreaterThanOrEqual(6);
    for (const persona of PERSONAS) {
      const policy = makePersonaBot(persona.id);
      expect(policy.persona.avatar).toBeTruthy();
      expect(policy.persona.emotes.length).toBeGreaterThan(0);
    }
    expect(() => makePersonaBot('nobody')).toThrow(/unknown persona/);
  });

  it('chooses a returned legal bid or bidNil', () => {
    const session = openSession({ seed: 12 });
    const seat = session.state.turn;
    const legal = spadesGame.flow.legalMovesFor?.(session.state, session.phase, seat) ?? [];
    const choice = chooseFromProfile(session.state, seat, legal, {
      int: () => 0,
      float: () => 0.5,
      shuffle: (items) => [...items],
      pick: (items) => items[0]!,
      fork: () => choiceRng(),
      getState: () => null,
      setState: () => undefined,
    }, profileForTier(2));
    expect(choice).not.toBeNull();
    expect(legal.some((move) => move.id === choice!.id && JSON.stringify(move.payload) === JSON.stringify(choice!.payload))).toBe(true);
  });
});

describe('bot matches', () => {
  it('every enumerated move validates, and a short match terminates', () => {
    const def = createSpadesDef();
    const record = runBotGame(def, {
      seed: 88,
      config: spadesConfig.resolve({ targetScore: 250 }),
      policies: [TIER_BOTS[2], TIER_BOTS[0], TIER_BOTS[2], TIER_BOTS[0]],
      maxEvents: 4_000,
    });
    expect(record.result).not.toBeNull();
    expect(record.stalled).toBeUndefined();
  });
});

function choiceRng() {
  return {
    int: () => 0,
    float: () => 0.5,
    shuffle: <T>(items: readonly T[]) => [...items],
    pick: <T>(items: readonly T[]) => items[0]!,
    fork: () => choiceRng(),
    getState: () => null,
    setState: () => undefined,
  };
}
