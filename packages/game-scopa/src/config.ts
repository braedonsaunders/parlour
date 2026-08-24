import { defineConfig, type ConfigFieldValue } from '@parlour/engine';

/**
 * Scopa house rules. The scoring constants (carte/denari/settebello/primiera,
 * 1 point each) are canonical and not configurable — the schema exposes only
 * the knobs a table may genuinely flip.
 */
export interface ScopaRules {
  /** first owner to reach this after a completed round wins (ties continue) */
  target: 11 | 16 | 21;
  /** deal the whole deck up front (Scopone): no stock, no mid-round redeals */
  scopone: boolean;
  /** Ace-2-3 of coins scores the length of the run continuing from 3 */
  napola: boolean;
  /** a bonus point for capturing the King of coins */
  reDenari: boolean;
  /** display-only: render denari/coppe/spade as diamonds/hearts/spades */
  frenchSuits: boolean;
  [key: string]: ConfigFieldValue;
}

export const TARGET_OPTIONS = [11, 16, 21] as const;

export const scopaConfig = defineConfig<ScopaRules>(
  [
    {
      key: 'target',
      kind: 'enum',
      label: 'Game to',
      group: 'Match',
      options: [
        { value: 11, label: '11 — classic' },
        { value: 16, label: '16 — long' },
        { value: 21, label: '21 — lungo' },
      ],
      default: 11,
      help: 'After each round the highest score at or above this line wins. A tie at the line deals another round.',
    },
    {
      key: 'scopone',
      kind: 'toggle',
      label: 'Scopone',
      group: 'Deal',
      default: false,
      advanced: true,
      help: 'The old-school four-hander: the whole deck is dealt at once and there is no stock to draw from. Capturing gets much tighter.',
    },
    {
      key: 'napola',
      kind: 'toggle',
      label: 'Napola',
      group: 'Scoring',
      default: false,
      advanced: true,
      help: 'Hold the Ace, 2 and 3 of coins for 3 bonus points, plus 1 more for each coin card that continues the run (4, 5, …).',
    },
    {
      key: 'reDenari',
      kind: 'toggle',
      label: 'Re di denari',
      group: 'Scoring',
      default: false,
      advanced: true,
      help: 'A bonus point for whoever captures the King of coins.',
    },
    {
      key: 'frenchSuits',
      kind: 'toggle',
      label: 'French-suited display',
      group: 'Table',
      default: true,
      help: 'Show coins/cups/swords as diamonds/hearts/spades so standard card art renders. Purely visual — ids and rules stay Italian.',
    },
  ],
  [
    { id: 'classic', label: 'Classic', values: {} },
    { id: 'lungo', label: 'Lungo', values: { target: 21 } },
    { id: 'scopone-preset', label: 'Scopone', values: { scopone: true } },
  ],
);
