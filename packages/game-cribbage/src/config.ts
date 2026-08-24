import { defineConfig } from '@parlour/engine';
import type { RuleValues } from '@parlour/engine';

/**
 * Cribbage house rules. The race target stays the classic 121; these are the
 * knobs pub tables actually argue about.
 */
export interface CribbageConfig extends RuleValues {
  /** call out a skunk when the loser finishes below 90 */
  skunks: boolean;
  /** unclaimed pegging points may be taken by the opponent (default off) */
  muggins: boolean;
  /** complete races to 121 required to win match play */
  gamesToWin: number;
}

export const cribbageConfigSchema = defineConfig<CribbageConfig>(
  [
    {
      key: 'skunks',
      kind: 'toggle',
      label: 'Skunk line at 90',
      default: true,
    },
    {
      key: 'muggins',
      kind: 'toggle',
      label: 'Muggins (steal unclaimed points)',
      default: false,
    },
    {
      key: 'gamesToWin',
      kind: 'int',
      label: 'Games to win',
      min: 1,
      max: 3,
      default: 1,
    },
  ],
  [
    { id: 'classic-pub', label: 'Classic Pub', values: {} },
    { id: 'cutthroat', label: 'Cutthroat', values: { muggins: true } },
    { id: 'match-play', label: 'Match Play', values: { gamesToWin: 2 } },
    { id: 'friendly', label: 'Friendly', values: { skunks: false, muggins: false } },
  ],
);
