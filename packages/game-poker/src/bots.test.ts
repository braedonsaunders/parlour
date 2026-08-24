import { describe, expect, it } from 'vitest';
import { makeRng } from '@parlour/engine';
import { TIER_BOTS, chenScore, equity, preflopStrength, tierBot } from './bots';
import { PERSONAS } from './bots/personas';
import { pokerGame } from './game';
import { againstATable } from './sim/tiers';
import { legalFor, openSession } from './test-util';

describe('reading two cards', () => {
  it('scores the premium hands above the trash', () => {
    // Chen: a pair of aces is the top of the scale, 72 offsuit the bottom.
    expect(chenScore(['S1', 'H1'])).toBeGreaterThan(chenScore(['S13', 'H13']));
    expect(chenScore(['S13', 'H13'])).toBeGreaterThan(chenScore(['S1', 'H12']));
    expect(chenScore(['S7', 'H2'])).toBeLessThan(chenScore(['S1', 'H12']));
    expect(preflopStrength(['S1', 'H1'])).toBeGreaterThan(0.9);
  });

  it('pays for suited and connected cards', () => {
    expect(chenScore(['S11', 'S10'])).toBeGreaterThan(chenScore(['S11', 'H10']));
    expect(chenScore(['S11', 'H10'])).toBeGreaterThan(chenScore(['S11', 'H4']));
  });
});

describe('reading a board', () => {
  it('puts the nuts far ahead of nothing on the same board', () => {
    const session = openSession({ seats: 2 });
    const board = ['S1', 'S13', 'S12'];
    const strong = {
      ...session.state,
      street: 'flop' as const,
      board,
      hole: [
        ['S11', 'S10'],
        ['??', '??'],
      ] as string[][],
    };
    const weak = {
      ...strong,
      hole: [
        ['H2', 'D7'],
        ['??', '??'],
      ] as string[][],
    };
    const rng = makeRng(5);
    expect(equity(strong, 0, rng, 200)).toBeGreaterThan(equity(weak, 0, rng, 200));
  });

  it('knows a hand that cannot be beaten', () => {
    const session = openSession({ seats: 2 });
    const nuts = {
      ...session.state,
      street: 'river' as const,
      board: ['S1', 'S13', 'S12', 'S11', 'S10'],
      hole: [
        ['H2', 'D7'],
        ['??', '??'],
      ] as string[][],
    };
    // A royal flush on the board is unbeatable, but every seat plays it, so the
    // pot is split rather than won outright.
    expect(equity(nuts, 0, makeRng(9), 100)).toBeCloseTo(0.5, 1);
  });
});

describe('the bot policies', () => {
  it('always returns a move the rules accept', () => {
    const session = openSession({ seats: 4, seed: 77 });
    const seat = session.state.turn as number;
    const legal = legalFor(session, seat);
    for (const bot of TIER_BOTS) {
      const view = pokerGame.playerView(session.state, seat);
      const choice = bot.chooseMove(view, seat, legal, makeRng(3), { thinkMs: () => 0 });
      expect(choice).not.toBeNull();
      expect(legal.some((move) => move.id === choice!.id)).toBe(true);
    }
  });

  it('ships three tiers and six personas with distinct ids', () => {
    expect(TIER_BOTS.map((bot) => bot.tier)).toEqual([1, 2, 3]);
    expect(new Set(PERSONAS.map((persona) => persona.id)).size).toBe(PERSONAS.length);
    expect(PERSONAS.every((persona) => persona.blurb.length > 0)).toBe(true);
    expect(tierBot(3).id).toBe('poker-hard');
  });

  it('never chooses a move outside the legal list, across a lot of spots', () => {
    let session = openSession({ seats: 5, seed: 404 });
    const rng = makeRng(404).fork('bots');
    for (let step = 0; step < 400 && session.status === 'playing'; step++) {
      const seat = session.state.turn;
      if (seat === null) break;
      const legal = legalFor(session, seat);
      const bot = TIER_BOTS[step % 3]!;
      const choice = bot.chooseMove(pokerGame.playerView(session.state, seat), seat, legal, rng, {
        thinkMs: () => 0,
      });
      expect(choice).not.toBeNull();
      expect(legal.some((move) => move.id === choice!.id)).toBe(true);
      const outcome = pokerGame.moves[choice!.id]!.validate(session.state, seat, choice!.payload);
      expect(outcome).toBe(true);
      session = { ...session };
      break;
    }
  });
});

describe('the difficulty tiers are ordered', () => {
  // Four-handed, which is what a solo game actually looks like. Heads-up
  // between two heuristic bots is much closer to a coin flip; see sim/gates.ts.
  const MATCHES = 40;
  const FAIR = 0.25;

  it('gives a sharp seat more than its share at a table of loose ones', () => {
    const hard = againstATable(3, 1, 4, MATCHES, {}, 40_000);
    expect(hard.rate).toBeGreaterThan(FAIR);
  }, 300_000);

  it('leaves a loose seat with less than its share at a table of sharp ones', () => {
    const easy = againstATable(1, 3, 4, MATCHES, {}, 42_000);
    expect(easy.rate).toBeLessThan(FAIR);
  }, 300_000);
});
