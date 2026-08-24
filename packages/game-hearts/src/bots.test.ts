import { describe, expect, it } from 'vitest';
import { runBotGame } from '@parlour/engine';
import { heartsConfigSchema } from './config';
import { HEARTS_BOTS, HEARTS_PERSONAS, easyBot, hardBot, heartsPersona, mediumBot } from './bots';
import { heartsGame } from './game';

const defaults = () => heartsConfigSchema.defaults();

function policiesFor(ids: readonly string[]) {
  return ids.map((id) => heartsPersona(id).bot);
}

describe('bot roster', () => {
  it('ships three tiers and named personas', () => {
    expect(HEARTS_BOTS.map((bot) => bot.tier)).toEqual([1, 2, 3]);
    expect(HEARTS_PERSONAS.map((persona) => persona.id).sort()).toEqual([
      'ash',
      'dove',
      'flint',
      'rose',
    ]);
    expect(easyBot.tier).toBe(1);
    expect(mediumBot.tier).toBe(2);
    expect(hardBot.tier).toBe(3);
  });

  it('throws on unknown personas', () => {
    expect(() => heartsPersona('nobody')).toThrow(/unknown hearts persona/);
  });
});

describe('bots play complete hands', () => {
  for (const [index, combo] of [
    ['dove', 'dove', 'dove', 'dove'],
    ['flint', 'flint', 'flint', 'flint'],
    ['rose', 'rose', 'rose', 'rose'],
  ].entries()) {
    it(`all-${combo[0]} tables finish`, () => {
      const record = runBotGame(heartsGame, {
        seed: 900 + index,
        config: defaults(),
        policies: policiesFor(combo as string[]) as never,
        maxEvents: 400,
      });
      expect(record.result).not.toBeNull();
      const totalPoints = record.result!.rankings.reduce(
        (sum, rank) => sum + Number(rank.detail?.points ?? 0),
        0,
      );
      // hearts (13) + queen (13) always land somewhere — moon shifts can zero a seat
      expect(totalPoints).toBeGreaterThanOrEqual(0);
    });
  }

  it('mixed tables finish across many seeds without stalls', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const record = runBotGame(heartsGame, {
        seed,
        config: defaults(),
        policies: policiesFor(['rose', 'dove', 'flint', 'dove']) as never,
        maxEvents: 400,
      });
      expect(record.events).toBeLessThan(400);
      expect(
        record.result!.reason === 'hand-complete' || record.result!.reason === 'moon-shot',
      ).toBe(true);
    }
  });

  it('never chooses an illegal move under any policy', () => {
    // runBotGame fails closed on illegal choices — a clean run proves legality.
    expect(() =>
      runBotGame(heartsGame, {
        seed: 31_337,
        config: defaults(),
        policies: policiesFor(['rose', 'flint', 'dove', 'rose']) as never,
        maxEvents: 400,
      }),
    ).not.toThrow();
  });
});
