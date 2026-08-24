import type { OhHellRules } from '@parlour/game-ohhell';

export type OhHellModeId = 'classic' | 'quick' | 'wizard';

export interface OhHellModeDef {
  id: OhHellModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

/**
 * Oh Hell's table settings — presentation for @parlour/game-ohhell's config
 * presets. Rule values live in the package schema.
 */
export const OHHELL_MODES: readonly OhHellModeDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Up and down',
    description:
      'One card each, then two, up to the ceiling and back down again. Bid exactly what you will take — every round changes shape under you.',
    facts: ['3–7 players', 'hand grows then shrinks', '~20 min'],
    accent: '#8a4b6b',
    shade: '#3d1f2e',
  },
  {
    id: 'quick',
    name: 'Quick',
    tagline: 'Deal big, shrink fast',
    description: 'Start at five cards and count down to one. The whole arc in half the rounds.',
    facts: ['3–7 players', 'five down to one', '~10 min'],
    accent: '#e29349',
    shade: '#96471c',
  },
  {
    id: 'wizard',
    name: 'Wizard',
    tagline: 'Sixty cards, four certainties',
    description:
      'Four Wizards that always win and four Jesters that always lose, on top of the usual deck. Certainty is the whole point — and it is still not enough.',
    facts: ['3–7 players', 'wizards · jesters', '~25 min'],
    accent: '#5b4b9a',
    shade: '#241d47',
  },
];

/** An Oh Hell match runs a full arc; used to time the tense music cue. */
export const OHHELL_MATCH_PACE_MS = 1_200_000;

const BY_ID = new Map(OHHELL_MODES.map((mode) => [mode.id, mode]));

export function getOhHellMode(id: OhHellModeId): OhHellModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown oh hell mode id: ${id}`);
  return mode;
}

export function isOhHellModeId(value: unknown): value is OhHellModeId {
  return typeof value === 'string' && BY_ID.has(value as OhHellModeId);
}

/** Maps resolved rule values back to the presentation preset, for records. */
export function ohhellModeForRules(rules: OhHellRules): OhHellModeId {
  if (rules.wizards) return 'wizard';
  return rules.handArc === 'down' ? 'quick' : 'classic';
}
