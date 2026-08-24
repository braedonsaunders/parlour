import { describe, expect, it } from 'vitest';
import { runBotGame } from '@parlour/engine';
import { spiteGame } from './game';
import { spiteTierBot } from './bots';

/**
 * Independent end-to-end check: a bot-driven match must actually finish.
 * The pack's own suite asserts rules in isolation; this asserts the flow does
 * not stall, which is the failure the debug trace hinted at.
 */
describe('spite plays to completion', () => {
  it('finishes a bot-driven game at every seat count', () => {
    for (const seats of [2, 3, 4]) {
      const policies = Array.from({ length: seats }, () => spiteTierBot(2));
      const record = runBotGame(spiteGame, { seed: 7 + seats, policies, maxEvents: 40_000 });
      expect(record.result, `seats=${seats}`).not.toBeNull();
      expect(record.result!.rankings).toHaveLength(seats);
      expect(record.events).toBeGreaterThan(10);
    }
  });

  it('finishes across many seeds without stalling', () => {
    let finished = 0;
    for (let seed = 0; seed < 40; seed++) {
      const policies = [spiteTierBot(2), spiteTierBot(2)];
      const record = runBotGame(spiteGame, { seed, policies, maxEvents: 40_000 });
      if (record.result) finished += 1;
    }
    expect(finished).toBe(40);
  });
});
