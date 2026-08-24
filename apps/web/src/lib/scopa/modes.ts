import type { ScopaRules } from '@parlour/game-scopa';

export type ScopaModeId = 'classic' | 'lungo' | 'scopone';

/**
 * Scopa table settings — presentation for the pack's config presets. Rule
 * values live in the package schema; this mirrors lib/spades/modes.ts.
 */
export interface ScopaModeDef {
  id: ScopaModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

export const SCOPA_MODES: readonly ScopaModeDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'First to eleven',
    description:
      'Three cards each, four on the table, and four points a round to fight over — plus a scopa every time you clear the felt.',
    facts: ['game to 11', '40-card deck', '~12 min'],
    accent: '#8a4b3c',
    shade: '#48211a',
  },
  {
    id: 'lungo',
    name: 'Lungo',
    tagline: 'The long road',
    description:
      'Same rules, twenty-one points. Long enough that primiera and the settebello decide it rather than one lucky sweep.',
    facts: ['game to 21', '40-card deck', '~25 min'],
    accent: '#e29349',
    shade: '#96471c',
  },
  {
    id: 'scopone',
    name: 'Scopone',
    tagline: 'The whole deck, dealt',
    description:
      'Every card dealt at once and no stock to draw from. You can count the deck from the first trick — and so can everyone else.',
    facts: ['whole deck dealt', 'no stock', 'for the sharks'],
    accent: '#3f6f5c',
    shade: '#1d3a30',
  },
];

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
 * Maps resolved rule values back to the presentation preset, for match records.
 *
 * Scopone is the only preset that deals the whole deck, and Lungo the only one
 * that raises the target past eleven — so the checks read most-specific first.
 */
export function scopaModeForRules(rules: ScopaRules): ScopaModeId {
  if (rules.scopone) return 'scopone';
  return rules.target > 11 ? 'lungo' : 'classic';
}
