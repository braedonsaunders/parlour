import { defineConfig, type RuleValues } from '@parlour/engine';

/**
 * President house rules. Every field is load-bearing in play and rendered as a
 * room-settings control by the app.
 */
export interface PresidentRules extends RuleValues {
  /** ★ a lone 2 wins the pile on the spot and leads the next trick */
  twoClears: boolean;
  /**
   * locked-pass variant: passing removes you from the rest of the trick.
   * Default off — a pass only skips the current beat, so you may rejoin if
   * somebody else beats the pile before the trick ends.
   */
  passLocks: boolean;
  /** ★ role-based card exchange between deals (needs 4+ seats) */
  trading: boolean;
  /** match ends when a seat banks this many position points */
  targetPoints: number;
}

export const DEFAULT_TARGET_POINTS = 11;
export const MIN_TARGET_POINTS = 5;
export const MAX_TARGET_POINTS = 21;

export const presidentConfig = defineConfig<PresidentRules>(
  [
    { key: 'twoClears', kind: 'toggle', label: 'A 2 clears the pile', default: true },
    { key: 'passLocks', kind: 'toggle', label: 'Passing locks you out of the trick', default: false },
    { key: 'trading', kind: 'toggle', label: 'Role card exchange between deals', default: true },
    {
      key: 'targetPoints',
      kind: 'int',
      label: 'First to (points)',
      min: MIN_TARGET_POINTS,
      max: MAX_TARGET_POINTS,
      default: DEFAULT_TARGET_POINTS,
    },
  ],
  [
    { id: 'classic', label: 'Classic Parlour', values: {} },
    { id: 'rapid', label: 'Rapid Cabinet', values: { targetPoints: 7 } },
    {
      id: 'marathon',
      label: 'Marathon',
      values: { targetPoints: 21, passLocks: false, twoClears: true, trading: true },
    },
  ],
);
