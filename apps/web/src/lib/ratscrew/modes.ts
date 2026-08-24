import { ratscrewCatalog } from '@parlour/game-ratscrew';

export type RatscrewModeId = 'classic' | 'quick-reflex' | 'slaphappy';

/**
 * Rat Screw's table settings, straight from the pack's shelf catalog — the
 * picker screens render these same objects, so presentation lives in one place
 * (packages/game-ratscrew/src/catalog.ts).
 */
export const RATSCREW_MODES = ratscrewCatalog.modes;

/**
 * A slap-happy match runs until one seat holds all 52 cards; this is the pace
 * the tense music cue measures its closing stretch against.
 */
export const RATSCREW_MATCH_PACE_MS = 480_000;

const BY_ID = new Map(RATSCREW_MODES.map((mode) => [mode.id, mode]));

export function isRatscrewModeId(value: unknown): value is RatscrewModeId {
  return typeof value === 'string' && BY_ID.has(value);
}

/** The mode whose preset matches these rules (first telltale toggle wins). */
export function ratscrewModeForRules(rules: {
  slapWindowMs: number;
  marriage: boolean;
  topBottom: boolean;
  runs: boolean;
}): RatscrewModeId {
  if (rules.slapWindowMs <= 700) return 'quick-reflex';
  if (rules.marriage || rules.topBottom || rules.runs) return 'slaphappy';
  return 'classic';
}
