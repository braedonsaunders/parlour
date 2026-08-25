import { defineConfig, type ConfigFieldValue } from '@parlour/engine';

export interface GolfRules {
  /** Ace and King connect. Classic Golf leaves them dead ends. */
  wrap: boolean;
  [key: string]: ConfigFieldValue;
}

export const golfConfig = defineConfig<GolfRules>(
  [
    {
      key: 'wrap',
      kind: 'toggle',
      label: 'Ace wraps King',
      group: 'Hole',
      default: false,
      help: 'Classic Golf stops at Ace and King. Fairway lets A and K play onto each other.',
    },
  ],
  [
    { id: 'classic', label: 'Classic', values: {} },
    { id: 'fairway', label: 'Fairway', values: { wrap: true } },
  ],
);
