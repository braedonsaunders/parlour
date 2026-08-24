import { defineConfig, type ConfigSchema, type SeatId } from '@parlour/engine';
import type { RuleValues } from '@parlour/engine';

/**
 * Blitz house rules (spec §5.2). Only knobs the round engine enforces are
 * declared here — every field below is load-bearing in play.
 */
export interface BlitzConfig extends RuleValues {
  /** three of a kind hand value: 30.5 (★) / 30 / off */
  threeOfAKind: '30.5' | '30' | 'off';
  /** who loses when the lowest hands are tied: both (★) / nobody / redeal */
  tieLowest: 'both' | 'nobody' | 'redeal';
  /** ★ can't re-discard the card just drawn from the discard pile */
  discardLock: boolean;
  /**
   * Bit i set ⇒ seat i sits this round out (classic elimination). Not a
   * house-rule field — the match layer writes it via `roundConfig`.
   */
  outMask: number;
}

/** Bitmask of seats whose lives have already hit zero. */
export function outMaskFromLives(lives: readonly number[]): number {
  return lives.reduce((mask, remaining, seat) => (remaining <= 0 ? mask | (1 << seat) : mask), 0);
}

export function outSeatsFromMask(mask: number | undefined, seats: number): SeatId[] {
  const bits = typeof mask === 'number' && Number.isSafeInteger(mask) ? mask : 0;
  const out: SeatId[] = [];
  for (let seat = 0; seat < seats; seat++) {
    if (bits & (1 << seat)) out.push(seat);
  }
  return out;
}

const inner = defineConfig<BlitzConfig>(
  [
    {
      key: 'threeOfAKind',
      kind: 'enum',
      label: 'Three of a kind',
      options: [
        { value: '30.5', label: 'Counts 30.5' },
        { value: '30', label: 'Counts 30' },
        { value: 'off', label: 'Off' },
      ],
      default: '30.5',
    },
    {
      key: 'tieLowest',
      kind: 'enum',
      label: 'Tied lowest',
      options: [
        { value: 'both', label: 'Both lose' },
        { value: 'nobody', label: 'Nobody loses' },
        { value: 'redeal', label: 'Redeal between tied' },
      ],
      default: 'both',
    },
    {
      key: 'discardLock',
      kind: 'toggle',
      label: 'Lock the discard you just drew',
      default: true,
    },
  ],
  [
    { id: 'classic-pub', label: 'Classic Pub', values: {} },
    { id: 'cutthroat', label: 'Cutthroat', values: { threeOfAKind: 'off', tieLowest: 'both' } },
    { id: 'friendly', label: 'Friendly', values: { tieLowest: 'nobody', discardLock: false } },
  ],
);

/** Preserves the match-layer `outMask` that `defineConfig` would otherwise drop. */
export const blitzConfigSchema: ConfigSchema<BlitzConfig> = {
  fields: inner.fields,
  presets: inner.presets,
  defaults: () => ({ ...inner.defaults(), outMask: 0 }),
  resolve(values) {
    const raw = values.outMask;
    const outMask = typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? raw : 0;
    return { ...inner.resolve(values), outMask };
  },
};
