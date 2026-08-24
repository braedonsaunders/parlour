import type { SpadesRules } from '@parlour/game-spades';

export type SpadesModeId = 'classic' | 'quick' | 'clean-books';

export interface SpadesModeDef {
  id: SpadesModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

/**
 * Spades' table settings — presentation for @parlour/game-spades' config
 * presets. Rule values live in the package schema; this catalog mirrors
 * lib/euchre/modes.ts and lib/hearts/modes.ts.
 */
export const SPADES_MODES: readonly SpadesModeDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'By the book',
    description:
      'Partnership Spades to 500, nil on, bags on. The game as it is played at every kitchen table.',
    facts: ['game to 500', 'nil · bags', '~25 min'],
    accent: '#3d4a6b',
    shade: '#1c2438',
  },
  {
    id: 'quick',
    name: 'Quick',
    tagline: 'First to 250',
    description:
      'Same rules, shorter race — 250 points and out. A whole match inside a lunch break.',
    facts: ['game to 250', 'nil · bags', '~12 min'],
    accent: '#e29349',
    shade: '#96471c',
  },
  {
    id: 'clean-books',
    name: 'Clean Books',
    tagline: 'No sandbags',
    description:
      'Make your bid or go set — overtricks are not bags and do not add a point. Precision over padding.',
    facts: ['game to 500', 'nil on', 'bags off'],
    accent: '#4ba1ba',
    shade: '#25586e',
  },
];

/** A Spades match runs long; used to time the tense music cue. */
export const SPADES_MATCH_PACE_MS = 1_500_000;

const BY_ID = new Map(SPADES_MODES.map((mode) => [mode.id, mode]));

export function getSpadesMode(id: SpadesModeId): SpadesModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown spades mode id: ${id}`);
  return mode;
}

export function isSpadesModeId(value: unknown): value is SpadesModeId {
  return typeof value === 'string' && BY_ID.has(value as SpadesModeId);
}

/**
 * Maps resolved rule values back to the presentation preset, for records.
 *
 * The three presets are separated by exactly one field each: `quick` drops the
 * target to 250, `clean-books` turns bags off at the standard 500, and
 * `classic` is the untouched default.
 */
export function spadesModeForRules(rules: SpadesRules): SpadesModeId {
  if (rules.targetScore === 250) return 'quick';
  return rules.bags ? 'classic' : 'clean-books';
}
