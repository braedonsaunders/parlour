import { defineConfig, type ConfigFieldValue } from '@parlour/engine';

/**
 * Spades house rules. Partnership play, follow-suit, broken-spades leads,
 * ±10× contracts, nil ±100, and 10-bag/−100 are canonical constants — the
 * schema only exposes the three knobs a table may flip.
 */
export interface SpadesRules {
  /** first team to reach this after a completed hand wins (ties continue) */
  targetScore: 250 | 500 | 750;
  /** bid 0 is Nil (+100 / −100, scored independently of the contract) */
  nil: boolean;
  /** overtricks are +1 bags; every 10 bags crossed costs −100, remainder kept */
  bags: boolean;
  [key: string]: ConfigFieldValue;
}

export const SPADES_TARGET_OPTIONS = [250, 500, 750] as const;
export const BAG_LIMIT = 10;
export const BAG_PENALTY = 100;
export const NIL_SCORE = 100;

export const spadesConfig = defineConfig<SpadesRules>(
  [
    {
      key: 'targetScore',
      kind: 'enum',
      label: 'Game to',
      group: 'Match',
      options: [
        { value: 250, label: '250 — quick cut' },
        { value: 500, label: '500 — standard' },
        { value: 750, label: '750 — long game' },
      ],
      default: 500,
      help: 'After each hand, the highest team at or above this score wins. Equal totals play another hand.',
    },
    {
      key: 'nil',
      kind: 'toggle',
      label: 'Allow nil',
      group: 'Bidding',
      default: true,
      help: 'A bid of zero is Nil: take no tricks for +100, or −100 if you take any. Failed-nil tricks do not help the partner contract.',
    },
    {
      key: 'bags',
      kind: 'toggle',
      label: 'Count bags',
      group: 'Scoring',
      default: true,
      help: 'Overtricks and failed-nil tricks are bags. Every ten bags costs 100 points; leftover bags stay on the card.',
    },
  ],
  [
    { id: 'classic', label: 'Classic', values: {} },
    { id: 'quick', label: 'Quick', values: { targetScore: 250 } },
    { id: 'clean-books', label: 'Clean Books', values: { bags: false } },
  ],
);
