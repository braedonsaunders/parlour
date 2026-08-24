import { defineConfig, type RuleValues } from '@parlour/engine';

/**
 * Ratscrew house rules. Every knob below is load-bearing in the reducers —
 * room settings UI is generated from this schema (spec §4.1).
 */
export interface RatscrewConfig extends RuleValues {
  /** slap two cards of the same rank in a row */
  doubles: boolean;
  /** slap two of a rank separated by exactly one card */
  sandwiches: boolean;
  /** slap two consecutive pip cards summing to ten */
  tens: boolean;
  /** how long the slap window stays open before play resumes (ms) */
  slapWindowMs: number;
}

export const ratscrewConfigSchema = defineConfig<RatscrewConfig>(
  [
    { key: 'doubles', kind: 'toggle', label: 'Doubles', default: true },
    { key: 'sandwiches', kind: 'toggle', label: 'Sandwiches', default: true },
    { key: 'tens', kind: 'toggle', label: 'Tens add to ten', default: false },
    { key: 'slapWindowMs', kind: 'int', label: 'Slap window', min: 400, max: 3000, default: 1200 },
  ],
  [
    { id: 'classic', label: 'Classic Slap', values: {} },
    { id: 'quick-reflex', label: 'Quick Reflex', values: { slapWindowMs: 700 } },
    { id: 'slaphappy', label: 'Slaphappy', values: { tens: true, slapWindowMs: 800 } },
  ],
);
