import { defineConfig, type ConfigFieldValue } from '@parlour/engine';

export interface PyramidRules {
  /** Classic allows two recycles (three passes). -1 is unlimited. */
  recyclesLimit: 2 | -1;
  [key: string]: ConfigFieldValue;
}

export const pyramidConfig = defineConfig<PyramidRules>(
  [
    {
      key: 'recyclesLimit',
      kind: 'enum',
      label: 'Waste recycles',
      group: 'Stock',
      options: [
        { value: 2, label: 'Two recycles — classic' },
        { value: -1, label: 'Unlimited — relaxed' },
      ],
      default: 2,
      help: 'Classic allows two recycles, three passes through the stock. Relaxed never runs out.',
    },
  ],
  [
    { id: 'classic', label: 'Classic', values: {} },
    { id: 'relaxed', label: 'Relaxed', values: { recyclesLimit: -1 } },
  ],
);
