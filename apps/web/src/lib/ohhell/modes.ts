import type { OhHellRules } from '@parlour/game-ohhell';

export type OhHellModeId = 'classic' | 'quick' | 'wizard';

/**
 * Oh Hell's table settings.
 *
 * Presentation only — the rule values live in the pack's config presets, and
 * this mirrors lib/spades/modes.ts. The three presets differ by exactly the
 * fields named in `ohhellModeForRules` below.
 */
export interface OhHellModeDef {
  id: OhHellModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

export const OHHELL_MODES: readonly OhHellModeDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Up and down',
    description:
      'One card, growing to a peak, back down to one. Hook rule on, exact bids only — someone misses every round.',
    facts: ['1…peak…1 hands', 'hook rule on', '~20 min'],
    accent: '#6b3d55',
    shade: '#381c2c',
  },
  {
    id: 'quick',
    name: 'Quick',
    tagline: 'Deal big, shrink fast',
    description:
      'Starts at five cards and counts straight down to one. A whole match inside ten minutes.',
    facts: ['5→1 hands', '~10 min'],
    accent: '#e29349',
    shade: '#96471c',
  },
  {
    id: 'wizard',
    name: 'Wizard',
    tagline: 'Sixty cards, four certainties',
    description:
      'Four Wizards always win and four Jesters never do. The led suit bends around them, and a turned Wizard hands trump to the dealer.',
    facts: ['60-card deck', 'wizards on'],
    accent: '#7b5bd6',
    shade: '#3c2b78',
  },
];

/** An Oh Hell match runs a full arc; used to time the tense music cue. */
export const OHHELL_MATCH_PACE_MS = 1_200_000;

const BY_ID = new Map(OHHELL_MODES.map((mode) => [mode.id, mode]));

export function getOhHellMode(id: OhHellModeId): OhHellModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown ohhell mode id: ${id}`);
  return mode;
}

export function isOhHellModeId(value: unknown): value is OhHellModeId {
  return typeof value === 'string' && BY_ID.has(value as OhHellModeId);
}

/**
 * Maps resolved rule values back to the presentation preset, for match records.
 *
 * `wizards` is the only field the Wizard preset moves, and `quick` is the only
 * preset that runs a down-only arc — so the two checks are ordered by how
 * specific they are, and anything else is Classic.
 */
export function ohhellModeForRules(rules: OhHellRules): OhHellModeId {
  if (rules.wizards) return 'wizard';
  return rules.handArc === 'down' ? 'quick' : 'classic';
}
