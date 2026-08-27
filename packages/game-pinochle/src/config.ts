import { defineConfig, type ConfigFieldValue } from '@parlour/engine';

/**
 * Pinochle house rules. Deal size, trick points, meld tables and the 60-point
 * bid ceiling are canonical constants — the schema only exposes the three
 * knobs a table may flip.
 */
export interface PinochleRules {
  /** first team to reach this after a completed hand wins the match */
  target: 100 | 150 | 500;
  /** the opening bid of an auction must be at least this many points */
  minBid: number;
  /** whether the non-bidding team's meld counts toward their score */
  opponentsScoreMeld: boolean;
  [key: string]: ConfigFieldValue;
}

export const PINOCHLE_TARGET_OPTIONS = [100, 150, 500] as const;
export const MAX_BID = 60;
export const MIN_BID_FLOOR = 20;
export const MIN_BID_CEILING = 30;

export const pinochleConfig = defineConfig<PinochleRules>(
  [
    {
      key: 'target',
      kind: 'enum',
      label: 'Game to',
      group: 'Match',
      options: [
        { value: 100, label: '100 — quick' },
        { value: 150, label: '150 — classic' },
        { value: 500, label: '500 — marathon' },
      ],
      default: 150,
      help: 'After each hand, the first partnership at or above this score wins.',
    },
    {
      key: 'minBid',
      kind: 'int',
      label: 'Minimum bid',
      group: 'Bidding',
      min: MIN_BID_FLOOR,
      max: MIN_BID_CEILING,
      default: 25,
      help: 'The opening bid of the auction must clear this floor. Every later bid must beat the one before it, up to 60.',
    },
    {
      key: 'opponentsScoreMeld',
      kind: 'toggle',
      label: 'Opponents score meld',
      group: 'Scoring',
      default: true,
      help: 'When off, the non-bidding team only scores the card points they take in tricks — not their meld.',
    },
  ],
  [
    { id: 'classic', label: 'Classic', values: { target: 150, minBid: 25 } },
    { id: 'quick', label: 'Quick', values: { target: 100, minBid: 20 } },
    { id: 'marathon', label: 'Marathon', values: { target: 500, minBid: 25 } },
  ],
);
