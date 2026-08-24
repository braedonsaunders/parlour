import type { PresidentRules } from '@parlour/game-president';

export type PresidentModeId = 'classic' | 'rapid' | 'marathon';

export interface PresidentModeDef {
  id: PresidentModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

/**
 * President's table settings — presentation for @parlour/game-president's
 * config presets (`classic` / `rapid` / `marathon`). Rule values live in the
 * package schema; this catalog is presentation only, mirroring lib/wild/modes.
 */
export const PRESIDENT_MODES: readonly PresidentModeDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'The full ladder',
    description:
      'Crowns, tributes and comebacks — first to eleven points takes the parlour. The way the pub plays it.',
    facts: ['first to 11', 'trading on', '2 clears'],
    accent: '#d9a441',
    shade: '#8a5c14',
  },
  {
    id: 'rapid',
    name: 'Rapid',
    tagline: 'Short and spicy',
    description:
      'First to seven keeps the table moving. Same rules, fewer deals, louder comebacks.',
    facts: ['first to 7', '~10 min', 'great with 6+'],
    accent: '#c2593f',
    shade: '#7a2f1f',
  },
  {
    id: 'marathon',
    name: 'Marathon',
    tagline: 'Long reigns',
    description:
      'Twenty-one points of politics. Scums become presidents, dynasties rise and fall.',
    facts: ['first to 21', 'long session', 'full arc'],
    accent: '#4ba1ba',
    shade: '#25586e',
  },
];

/** A comfortable full-table match; the tense-music cue measures against this. */
export const PRESIDENT_MATCH_PACE_MS = 900_000;

const BY_ID = new Map(PRESIDENT_MODES.map((mode) => [mode.id, mode]));

export function getPresidentMode(id: PresidentModeId): PresidentModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown president mode id: ${id}`);
  return mode;
}

export function isPresidentModeId(value: unknown): value is PresidentModeId {
  return typeof value === 'string' && BY_ID.has(value as PresidentModeId);
}

export function presidentModeForRules(rules: PresidentRules): PresidentModeId {
  if (rules.targetPoints <= 7) return 'rapid';
  if (rules.targetPoints >= 21) return 'marathon';
  return 'classic';
}
