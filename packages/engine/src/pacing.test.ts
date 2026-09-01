import { describe, expect, it } from 'vitest';
import {
  TABLE_PACING,
  botThinkTimeMs,
  tableTransitionPacing,
  type TablePacingMode,
} from './pacing';

describe('shared table pacing', () => {
  it('gives casual players a readable beat after the cards land', () => {
    expect(TABLE_PACING.casual.postFxMs).toBeGreaterThanOrEqual(500);
    expect(TABLE_PACING.casual.botThinkMinMs).toBeGreaterThanOrEqual(400);
    expect(TABLE_PACING.casual.botThinkMaxMs).toBeLessThanOrEqual(900);
  });

  it.each(['timed', 'takeover'] satisfies TablePacingMode[])(
    'keeps %s decisions below the snap-play ceiling',
    (mode) => {
      expect(TABLE_PACING[mode].botThinkMaxMs).toBeLessThan(150);
    },
  );

  it('is deterministic for a replay position and varies across positions', () => {
    const input = { mode: 'casual' as const, seed: 8128, turn: 4, seat: 2 };
    expect(botThinkTimeMs(input)).toBe(botThinkTimeMs(input));

    const beats = new Set(
      Array.from({ length: 12 }, (_, turn) => botThinkTimeMs({ ...input, turn })),
    );
    expect(beats.size).toBeGreaterThan(1);
  });

  it('does not add a thinking beat to automatic moves', () => {
    expect(botThinkTimeMs({ mode: 'automatic', seed: 1, turn: 0, seat: 0 })).toBe(0);
  });

  it('keeps a same-seat follow-up brisk without shortening a human handoff', () => {
    expect(tableTransitionPacing('casual', [0], [0])).toBe('brisk');
    expect(tableTransitionPacing('casual', [0], [1])).toBe('casual');
    expect(tableTransitionPacing('casual', [0], [0, 1])).toBe('casual');
  });
});
