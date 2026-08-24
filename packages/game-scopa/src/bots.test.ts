import { describe, expect, it } from 'vitest';
import { makeRng, runBotGame } from '@parlour/engine';
import { TIER_BOTS, tierBot } from './bots';
import { makePersonaBot, PERSONAS } from './bots/personas';
import { scopaConfig } from './config';
import { scopaGame } from './game';
import { makeState } from './test-util';
import type { ScopaState } from './state';

const config = scopaConfig.resolve({ target: 11 });

function legalFor(state: ScopaState) {
  const phase = { phase: 'playing', actor: state.turn, round: state.roundNo };
  return scopaGame.flow.legalMovesFor?.(state, phase, state.turn) ?? [];
}

describe('bot roster', () => {
  it('ships three distinct tiers and six personas', () => {
    expect(TIER_BOTS.map((bot) => bot.tier)).toEqual([1, 2, 3]);
    expect(PERSONAS.length).toBeGreaterThanOrEqual(4);
    expect(makePersonaBot('rosetta').persona.name).toBe('Rosetta');
    expect(() => makePersonaBot('nobody')).toThrow(/unknown persona/);
  });

  it('every persona is a valid policy with its own identity', () => {
    for (const persona of PERSONAS) {
      const bot = makePersonaBot(persona.id);
      expect(bot.id).toBe(`scopa-persona-${persona.id}`);
      expect(bot.persona.blurb.length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(bot.tier);
    }
  });
});

describe('bots play legally', () => {
  it('tier bots complete matches at every supported seat count', () => {
    for (const seats of [2, 3, 4, 6] as const) {
      const policies = Array.from(
        { length: seats },
        (_, seat) => TIER_BOTS[seat % TIER_BOTS.length]!,
      );
      const record = runBotGame(scopaGame, {
        seed: 9_100 + seats,
        config,
        policies,
        maxEvents: 8_000,
      });
      expect(record.result).not.toBeNull();
    }
  });

  it('personas complete a mixed six-seat match without illegal moves', () => {
    const policies = PERSONAS.slice(0, 6).map((persona) => makePersonaBot(persona.id));
    const record = runBotGame(scopaGame, {
      seed: 9_777,
      config: scopaConfig.resolve({ target: 16 }),
      policies,
      maxEvents: 8_000,
    });
    expect(record.result).not.toBeNull();
  });

  it('easy takes the biggest capture when one exists', () => {
    const state = makeState({ hands: [['D5'], []], table: ['S2', 'B3', 'C4'] });
    const legal = legalFor(state);
    expect(legal.length).toBeGreaterThan(1);
    const choice = tierBot(1).chooseMove(scopaGame.playerView(state, 0), 0, legal, makeRng(1), {
      thinkMs: () => 0,
    });
    const take = (choice?.payload as { take?: string[] })?.take ?? [];
    expect(take.length).toBe(2); // the S2+B3 sum beats posing
  });

  it('easy poses the lowest card when nothing captures', () => {
    const state = makeState({ hands: [['B7', 'D2', 'C5']], table: ['S9'] });
    const legal = legalFor(state);
    const choice = tierBot(1).chooseMove(scopaGame.playerView(state, 0), 0, legal, makeRng(1), {
      thinkMs: () => 0,
    });
    expect((choice?.payload as { card?: string })?.card).toBe('D2');
  });

  it('medium breaks a tie between equal captures in favour of denari', () => {
    const state = makeState({ hands: [['B5']], table: ['D5', 'C5'] });
    const legal = legalFor(state);
    expect(legal).toHaveLength(2); // both singletons on offer, nothing else
    const choice = tierBot(2).chooseMove(scopaGame.playerView(state, 0), 0, legal, makeRng(7), {
      thinkMs: () => 0,
    });
    expect((choice?.payload as { take?: string[] })?.take).toEqual(['D5']);
  });
});
