import { defineConfig, type ConfigFieldValue } from '@parlour/engine';

export interface KlondikeRules {
  /** Cards turned from stock to waste per draw. */
  drawCount: 1 | 3;
  [key: string]: ConfigFieldValue;
}

export const klondikeConfig = defineConfig<KlondikeRules>(
  [
    {
      key: 'drawCount',
      kind: 'enum',
      label: 'Stock draw',
      group: 'Deal',
      options: [
        { value: 3, label: 'Draw three — classic' },
        { value: 1, label: 'Draw one — relaxed' },
      ],
      default: 3,
      help: 'Turn one or three cards at a time. The waste may be recycled without a pass limit.',
    },
  ],
  [
    { id: 'classic', label: 'Classic', values: {} },
    { id: 'relaxed', label: 'Relaxed', values: { drawCount: 1 } },
  ],
);
