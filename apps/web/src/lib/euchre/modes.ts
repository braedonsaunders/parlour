import type { EuchreRules } from '@parlour/game-euchre';

export type EuchreModeId = 'classic' | 'quick-cut' | 'long-game' | 'old-school';

export interface EuchreModeDef {
  id: EuchreModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

/**
 * Euchre's table settings — presentation for @parlour/game-euchre's config
 * presets. Rule values live in the package schema; this catalog mirrors
 * lib/modes.ts and lib/wild/modes.ts.
 */
export const EUCHRE_MODES: readonly EuchreModeDef[] = [
  {
    id: 'classic',
    name: 'Classic Pub',
    tagline: 'The real deal',
    description:
      'Ten points, stick the dealer, going alone. The game as it is played at every firehall and kitchen table.',
    facts: ['game to 10', 'stick the dealer', '~20 min'],
    accent: '#5fae7b',
    shade: '#2f6b48',
  },
  {
    id: 'quick-cut',
    name: 'Quick Cut',
    tagline: 'First to five',
    description:
      'Same rules, shorter race — five points and out. Perfect when the kettle is still warming.',
    facts: ['game to 5', 'stick the dealer', '~10 min'],
    accent: '#e29349',
    shade: '#96471c',
  },
  {
    id: 'long-game',
    name: 'Long Game',
    tagline: 'Settle in',
    description: 'Fifteen points for a proper evening of it. Grudges welcome.',
    facts: ['game to 15', 'stick the dealer', '~30 min'],
    accent: '#c8566b',
    shade: '#7c2c3e',
  },
  {
    id: 'old-school',
    name: 'Old School',
    tagline: 'Dealer may pass',
    description:
      'No stick-the-dealer — everyone can pass and the deal moves on. The way some granddads insist on it.',
    facts: ['game to 10', 'no stick', '~20 min'],
    accent: '#4ba1ba',
    shade: '#25586e',
  },
];

/** A euchre hand runs a few minutes; used to time the tense music cue. */
export const EUCHRE_MATCH_PACE_MS = 1_200_000;

const BY_ID = new Map(EUCHRE_MODES.map((mode) => [mode.id, mode]));

export function getEuchreMode(id: EuchreModeId): EuchreModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown euchre mode id: ${id}`);
  return mode;
}

export function isEuchreModeId(value: unknown): value is EuchreModeId {
  return typeof value === 'string' && BY_ID.has(value as EuchreModeId);
}

/** Maps resolved rule values back to the presentation preset, for records. */
export function euchreModeForRules(rules: EuchreRules): EuchreModeId {
  if (rules.targetScore === 5) return 'quick-cut';
  if (rules.targetScore === 15) return 'long-game';
  return rules.stickDealer ? 'classic' : 'old-school';
}
