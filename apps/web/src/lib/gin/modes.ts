export type GinModeId = 'classic' | 'quick' | 'purist';

export interface GinModeDef {
  id: GinModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

/**
 * Gin's table settings — presentation mirrors of the config presets declared
 * in `packages/game-gin/src/catalog.ts`. Rule values live in the pack.
 */
export const GIN_MODES: readonly GinModeDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Straight to 100',
    description:
      'The pub standard — knock at ten deadwood or better, gin pays 25, big gin pays 31. First past 100 takes it.',
    facts: ['knock cap 10', 'match to 100', '~15 min'],
    accent: '#5f9e6e',
    shade: '#2e5940',
  },
  {
    id: 'quick',
    name: 'Quick',
    tagline: 'Race to 50',
    description: 'Same rules, shorter ladder. A brisk two-hander for the kettle break.',
    facts: ['match to 50', '~8 min'],
    accent: '#e29349',
    shade: '#96471c',
  },
  {
    id: 'purist',
    name: 'Purist',
    tagline: 'No frills',
    description:
      'Big gin is off and box bonuses stay home. Pure knocks, pure deadwood, no safety net.',
    facts: ['no big gin', 'no box bonus'],
    accent: '#7f6bd0',
    shade: '#402f7a',
  },
];

const BY_ID = new Map(GIN_MODES.map((mode) => [mode.id, mode]));

export function getGinMode(id: GinModeId): GinModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown gin mode id: ${id}`);
  return mode;
}

export function isGinModeId(value: unknown): value is GinModeId {
  return typeof value === 'string' && BY_ID.has(value as GinModeId);
}

/** A full match runs several hands; this paces the tense-music cue. */
export const GIN_MATCH_PACE_MS = 780_000;
