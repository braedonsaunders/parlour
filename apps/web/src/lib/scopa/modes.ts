import { modePreset } from '@parlour/engine';
import { scopaCatalog, type ScopaRules } from '@parlour/game-scopa';

export type ScopaModeId = 'classic' | 'lungo' | 'scopone';

export interface ScopaModeDef {
  id: ScopaModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

/**
 * Scopa's table settings — presentation for @parlour/game-scopa's config
 * presets. Rule values live in the package schema.
 */
export const SCOPA_MODES: readonly ScopaModeDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'First to 11',
    description:
      'Three cards each, four on the table. Take a card by matching it, or by matching the sum of several — and clear the table for a scopa.',
    facts: ['2–6 players', 'game to 11', '~15 min'],
    accent: '#3f7d5a',
    shade: '#1b3a29',
  },
  {
    id: 'lungo',
    name: 'Lungo',
    tagline: 'The long game',
    description: 'The same rules played to 21. Room for the primiera and the sevens to matter.',
    facts: ['2–6 players', 'game to 21', '~30 min'],
    accent: '#4ba1ba',
    shade: '#25586e',
  },
  {
    id: 'scopone',
    name: 'Scopone',
    tagline: 'Whole deck, no mercy',
    description:
      'The whole deck dealt at once and nothing held back — every card is known to somebody from the first play.',
    facts: ['4 players · 2v2', 'no stock', '~25 min'],
    accent: '#8a4b6b',
    shade: '#3d1f2e',
  },
];

/** A Scopa match is a handful of quick rounds; used to time the tense cue. */
export const SCOPA_MATCH_PACE_MS = 900_000;

const BY_ID = new Map(SCOPA_MODES.map((mode) => [mode.id, mode]));

export function getScopaMode(id: ScopaModeId): ScopaModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown scopa mode id: ${id}`);
  return mode;
}

export function isScopaModeId(value: unknown): value is ScopaModeId {
  return typeof value === 'string' && BY_ID.has(value as ScopaModeId);
}

/**
 * The config preset behind a mode tile.
 *
 * Scopa is the one pack whose preset ids are not its mode ids — `scopone` the
 * tile resolves to `scopone-preset` the preset — so this reads the mapping off
 * the catalog rather than assuming they match.
 */
export function scopaPresetFor(mode: ScopaModeId): string {
  const entry = scopaCatalog.modes.find((candidate) => candidate.id === mode);
  return (entry ? modePreset(entry) : null) ?? 'classic';
}

/** Maps resolved rule values back to the presentation preset, for records. */
export function scopaModeForRules(rules: ScopaRules): ScopaModeId {
  if (rules.scopone) return 'scopone';
  return rules.target === 21 ? 'lungo' : 'classic';
}
