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
  /** slap a King and Queen back-to-back (either order) */
  marriage: boolean;
  /** slap two consecutive pip cards summing to ten */
  tens: boolean;
  /** slap when the top card matches the bottom card of the center pile */
  topBottom: boolean;
  /** slap three consecutive ranks on top of the pile, climbing or falling */
  runs: boolean;
  /** a slap with no live pattern burns the slapper's top card under the pile */
  misSlapBurn: boolean;
  /** an empty-handed seat may still slap a live pattern to re-enter */
  slapBackIn: boolean;
  /** how long the slap window stays open before play resumes (ms) */
  slapWindowMs: number;
}

export const ratscrewConfigSchema = defineConfig<RatscrewConfig>(
  [
    { key: 'doubles', kind: 'toggle', label: 'Doubles', default: true },
    { key: 'sandwiches', kind: 'toggle', label: 'Sandwiches', default: true },
    { key: 'marriage', kind: 'toggle', label: 'Marriage (K+Q)', default: false },
    { key: 'tens', kind: 'toggle', label: 'Tens add to ten', default: false },
    { key: 'topBottom', kind: 'toggle', label: 'Top-bottom', default: false },
    { key: 'runs', kind: 'toggle', label: 'Runs', default: false },
    { key: 'misSlapBurn', kind: 'toggle', label: 'Mis-slap burns a card', default: true },
    { key: 'slapBackIn', kind: 'toggle', label: 'Slap back in when out', default: true },
    { key: 'slapWindowMs', kind: 'int', label: 'Slap window', min: 400, max: 3000, default: 1200 },
  ],
  [
    { id: 'classic', label: 'Classic Slap', values: {} },
    { id: 'quick-reflex', label: 'Quick Reflex', values: { slapWindowMs: 700 } },
    {
      id: 'slaphappy',
      label: 'Slaphappy',
      values: {
        marriage: true,
        tens: true,
        topBottom: true,
        runs: true,
        slapWindowMs: 800,
      },
    },
  ],
);
