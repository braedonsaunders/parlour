import type { WildpileRules } from '@parlour/game-wildpile';

export type WildModeId = 'classic' | 'party';

export interface WildModeDef {
  id: WildModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

/**
 * Wild's two table settings — presentation for @parlour/game-wildpile's config
 * presets (`classic` / `party`). Rule values live in the package's schema; this
 * catalog is presentation only, mirroring lib/modes.ts for Blitz.
 */
export const WILD_MODES: readonly WildModeDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'By the book',
    description:
      'Match the color or the number, shed every card. No stacking, no jump-ins — a polite riot.',
    facts: ['one deal', 'no stacking', '~5 min'],
    accent: '#4ba1ba',
    shade: '#25586e',
  },
  {
    id: 'party',
    name: 'Party',
    tagline: 'House rules on',
    description:
      'Draw-twos and draw-fours pile up, and an exact match lets anyone jump in out of turn. Chaos, warmly lit.',
    facts: ['stacking on', 'jump-ins on', '~5 min'],
    accent: '#c8566b',
    shade: '#7c2c3e',
  },
];

/**
 * Wild deals once and runs about five minutes. There is no match clock, so this
 * is the pace the tense music cue measures its final minute against.
 */
export const WILD_MATCH_PACE_MS = 300_000;

const BY_ID = new Map(WILD_MODES.map((mode) => [mode.id, mode]));

export function getWildMode(id: WildModeId): WildModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown wild mode id: ${id}`);
  return mode;
}

export function isWildModeId(value: unknown): value is WildModeId {
  return typeof value === 'string' && BY_ID.has(value as WildModeId);
}

export function wildModeForRules(rules: WildpileRules): WildModeId {
  return rules.stacking || rules.jumpIn ? 'party' : 'classic';
}
