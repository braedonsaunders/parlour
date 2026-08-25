import { defineConfig, type ConfigFieldValue } from '@parlour/engine';

export interface SpiderRules {
  /** How many suits the two-deck deal is painted in. */
  suitCount: 1 | 2 | 4;
  [key: string]: ConfigFieldValue;
}

export const spiderConfig = defineConfig<SpiderRules>(
  [
    {
      key: 'suitCount',
      kind: 'enum',
      label: 'Suits',
      group: 'Deal',
      options: [
        { value: 1, label: 'One suit — relaxed' },
        { value: 2, label: 'Two suits — classic' },
        { value: 4, label: 'Four suits — hard' },
      ],
      default: 2,
      help: 'One-suit deals are all spades. Classic uses spades and hearts. Hard uses every suit.',
    },
  ],
  [
    { id: 'relaxed', label: 'Relaxed', values: { suitCount: 1 } },
    { id: 'classic', label: 'Classic', values: { suitCount: 2 } },
    { id: 'hard', label: 'Hard', values: { suitCount: 4 } },
  ],
);
