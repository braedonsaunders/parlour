import type { RatscrewConfig } from '@parlour/game-ratscrew';

export type RatscrewModeId = 'classic' | 'quick-reflex' | 'slaphappy';

export interface RatscrewModeDef {
  id: RatscrewModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

/**
 * Rat Screw's three table settings — presentation for
 * @parlour/game-ratscrew's config presets (`classic` / `quick-reflex` /
 * `slaphappy`). Rule values live in the package's schema; this catalog is
 * presentation only, mirroring lib/wild/modes.ts.
 */
export const RATSCREW_MODES: readonly RatscrewModeDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Doubles & sandwiches',
    description:
      'The pub standard: flip fast, watch for doubles and sandwiches, and slap before the window shuts.',
    facts: ['slap window 1.2s', 'mis-slaps burn', '~8 min'],
    accent: '#d98e3c',
    shade: '#7c4a17',
  },
  {
    id: 'quick-reflex',
    name: 'Quick Reflex',
    tagline: 'Mean windows',
    description:
      'Same classic patterns on a hair-trigger — the slap window slams shut in 0.7 seconds.',
    facts: ['slap window 0.7s', 'for sharp eyes', '~6 min'],
    accent: '#b8593f',
    shade: '#6e2a1a',
  },
  {
    id: 'slaphappy',
    name: 'Slaphappy',
    tagline: 'Every pattern live',
    description:
      'Marriages, tens, top-bottom and runs all count. Chaos, warmly lit, extremely loud.',
    facts: ['all patterns', 'slap window 0.8s', '~5 min'],
    accent: '#8f5fb5',
    shade: '#4a2a68',
  },
];

/**
 * A slap-happy match runs until one seat holds all 52 cards; this is the pace
 * the tense music cue measures its closing stretch against.
 */
export const RATSCREW_MATCH_PACE_MS = 480_000;

const BY_ID = new Map(RATSCREW_MODES.map((mode) => [mode.id, mode]));

export function getRatscrewMode(id: RatscrewModeId): RatscrewModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown ratscrew mode id: ${id}`);
  return mode;
}

export function isRatscrewModeId(value: unknown): value is RatscrewModeId {
  return typeof value === 'string' && BY_ID.has(value as RatscrewModeId);
}

/** The mode whose preset matches these rules (first toggle wins). */
export function ratscrewModeForRules(rules: RatscrewConfig): RatscrewModeId {
  if (rules.slapWindowMs <= 700) return 'quick-reflex';
  if (rules.marriage || rules.topBottom || rules.runs) return 'slaphappy';
  return 'classic';
}
