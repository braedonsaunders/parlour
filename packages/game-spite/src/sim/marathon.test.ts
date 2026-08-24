import { applyPreset, runBotGame, type BotPolicy } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { spiteConfig } from '../config';
import { spiteGame } from '../game';
import type { SpiteState } from '../state';
import { PERSONAS, makePersonaBot, spiteTierBot } from '../bots';

/**
 * The brief's endurance gate: 500+ headless games across 2, 3 and 4 seats and
 * every rule preset with zero stalls. `runBotGame` throws on a stall or an
 * illegal bot move, so simply surviving the loop is the assertion — no
 * `tolerateStalls` escape hatch here.
 */

const GAMES_PER_PLAN: readonly { seats: number; preset: string; games: number }[] = [
  { seats: 2, preset: 'classic', games: 100 },
  { seats: 2, preset: 'quick', games: 100 },
  { seats: 3, preset: 'quick', games: 100 },
  { seats: 3, preset: 'cutthroat', games: 50 },
  { seats: 4, preset: 'quick', games: 80 },
  { seats: 4, preset: 'classic', games: 70 },
];

function policiesFor(seats: number, gameIndex: number): BotPolicy<SpiteState>[] {
  // Rotate tiers and personas so every seat count samples the whole roster.
  return Array.from({ length: seats }, (_, seat) => {
    const cursor = gameIndex + seat;
    if (cursor % 3 === 2) {
      const persona = PERSONAS[cursor % PERSONAS.length]!;
      return makePersonaBot(persona.id);
    }
    return spiteTierBot(((cursor % 3) + 1) as 1 | 2 | 3);
  });
}

describe('headless marathon', () => {
  it('plays 500+ games across seat counts and presets with zero stalls', () => {
    let total = 0;
    let cleared = 0;
    const reasons = new Map<string, number>();
    for (const plan of GAMES_PER_PLAN) {
      const config = applyPreset(spiteConfig, plan.preset);
      for (let i = 0; i < plan.games; i++) {
        const record = runBotGame(spiteGame, {
          seed: 400_000 + total,
          policies: policiesFor(plan.seats, total),
          config,
          maxEvents: 12_000,
        });
        expect(record.result?.winner, `${plan.preset} ${plan.seats}p #${i}`).not.toBeNull();
        const reason = record.result?.reason ?? 'none';
        reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
        if (reason === 'payoff-cleared') cleared += 1;
        total += 1;
      }
    }
    expect(total).toBeGreaterThanOrEqual(500);
    // The normal ending dominates; table locks are pathological by definition.
    expect(cleared / total).toBeGreaterThan(0.9);
  }, 120_000);
});
