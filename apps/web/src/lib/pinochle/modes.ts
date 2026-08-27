import type { PinochleRules } from '@parlour/game-pinochle';

export type PinochleModeId = 'classic' | 'quick' | 'marathon';

export interface PinochleModeDef {
  id: PinochleModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

/**
 * Pinochle's table settings — presentation for @parlour/game-pinochle's config
 * presets. Rule values live in the package schema; this catalog mirrors
 * lib/euchre/modes.ts and lib/wild/modes.ts. Ids match the pack's own preset
 * ids exactly (`classic` / `quick` / `marathon`), unlike Euchre where the app's
 * mode ids and the pack's preset ids differ.
 */
export const PINOCHLE_MODES: readonly PinochleModeDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Game to 150',
    description:
      'Partnership Pinochle to 150, minimum opening bid 25. The game as it is played at every kitchen table.',
    facts: ['game to 150', 'min bid 25', '~30 min'],
    accent: '#8a5a44',
    shade: '#4a2c1f',
  },
  {
    id: 'quick',
    name: 'Quick',
    tagline: 'First to 100',
    description: 'Same rules, shorter race — 100 points, lower opening bid, out the door faster.',
    facts: ['game to 100', 'min bid 20', '~15 min'],
    accent: '#e29349',
    shade: '#96471c',
  },
  {
    id: 'marathon',
    name: 'Marathon',
    tagline: 'Game to 500',
    description: 'A long partnership grind to 500 — every meld and every set matters.',
    facts: ['game to 500', 'min bid 25', '~90 min'],
    accent: '#4ba1ba',
    shade: '#25586e',
  },
];

const BY_ID = new Map(PINOCHLE_MODES.map((mode) => [mode.id, mode]));

export function getPinochleMode(id: PinochleModeId): PinochleModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown pinochle mode id: ${id}`);
  return mode;
}

export function isPinochleModeId(value: unknown): value is PinochleModeId {
  return typeof value === 'string' && BY_ID.has(value as PinochleModeId);
}

/** Maps resolved rule values back to the presentation preset, for records. */
export function pinochleModeForRules(rules: PinochleRules): PinochleModeId {
  if (rules.target === 500) return 'marathon';
  if (rules.target === 100) return 'quick';
  return 'classic';
}

/** Typical match length for the tension cue — a partnership match to a target score. */
export const PINOCHLE_MATCH_PACE_MS = 1_200_000;
