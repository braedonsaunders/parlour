import { defineConfig } from '@parlour/engine';
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
}

export const blitzConfigSchema = defineConfig<BlitzConfig>(
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
