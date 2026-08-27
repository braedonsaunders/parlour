import { defineConfig, type ConfigFieldValue } from '@parlour/engine';

export interface TripeaksRules {
  /** Ace and King connect. Classic TriPeaks leaves them dead ends. */
  wrap: boolean;
  /** Relaxed allows one shuffle of the hole (minus its top card) back into the stock. */
  recycle: boolean;
  [key: string]: ConfigFieldValue;
}

export const tripeaksConfig = defineConfig<TripeaksRules>(
  [
    {
      key: 'wrap',
      kind: 'toggle',
      label: 'Ace wraps King',
      group: 'Hole',
      default: false,
      help: 'Classic TriPeaks stops at Ace and King. Relaxed lets A and K play onto each other.',
    },
    {
      key: 'recycle',
      kind: 'toggle',
      label: 'Recycle the hole',
      group: 'Stock',
      default: false,
      help: 'When the stock runs dry, shuffle the hole (minus its top card) back into the stock once.',
    },
  ],
  [
    { id: 'classic', label: 'Classic', values: {} },
    { id: 'relaxed', label: 'Relaxed', values: { wrap: true, recycle: true } },
  ],
);
