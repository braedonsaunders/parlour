import { defineConfig, type ConfigFieldValue } from '@parlour/engine';

export interface FreecellRules {
  /** One-card parking slots. Classic uses four; Relaxed uses six. */
  freeCells: 4 | 6;
  [key: string]: ConfigFieldValue;
}

export const freecellConfig = defineConfig<FreecellRules>(
  [
    {
      key: 'freeCells',
      kind: 'enum',
      label: 'Free cells',
      group: 'Deal',
      options: [
        { value: 4, label: 'Four cells — classic' },
        { value: 6, label: 'Six cells — relaxed' },
      ],
      default: 4,
      help: 'Park one card in each cell. Relaxed adds two extra cells.',
    },
  ],
  [
    { id: 'classic', label: 'Classic', values: {} },
    { id: 'relaxed', label: 'Relaxed', values: { freeCells: 6 } },
  ],
);
