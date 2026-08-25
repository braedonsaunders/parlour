import type { SpiteRules } from '@parlour/game-spite';

export type SpiteModeId = 'classic' | 'quick' | 'cutthroat';

export interface SpiteModeDef {
  id: SpiteModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

/**
 * Spite & Malice's table settings — presentation for @parlour/game-spite's
 * config presets. Rule values live in the package schema.
 */
export const SPITE_MODES: readonly SpiteModeDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'The full race',
    description:
      'A tall payoff pile each and four centre builds running ace to queen. Empty your pile first — and use your discards to make sure nobody else can.',
    facts: ['2–4 players', 'the long pile', '~25 min'],
    accent: '#7a4b8a',
    shade: '#2e1c3a',
  },
  {
    id: 'quick',
    name: 'Quick',
    tagline: 'Shorter grudge',
    description: 'A shorter payoff pile. Same spite, half the time.',
    facts: ['2–4 players', 'short pile', '~12 min'],
    accent: '#e29349',
    shade: '#96471c',
  },
  {
    id: 'cutthroat',
    name: 'Cutthroat',
    tagline: 'No refills',
    description:
      'Your hand is not topped up mid-turn — play it out and you wait for the next one. Spend it carefully.',
    facts: ['2–4 players', 'no mid-turn refill', '~20 min'],
    accent: '#c2593f',
    shade: '#7a2f1f',
  },
];

/** A Spite match is a long race; used to time the tense music cue. */
export const SPITE_MATCH_PACE_MS = 1_200_000;

const BY_ID = new Map(SPITE_MODES.map((mode) => [mode.id, mode]));

export function getSpiteMode(id: SpiteModeId): SpiteModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown spite mode id: ${id}`);
  return mode;
}

export function isSpiteModeId(value: unknown): value is SpiteModeId {
  return typeof value === 'string' && BY_ID.has(value as SpiteModeId);
}

/** Maps resolved rule values back to the presentation preset, for records. */
export function spiteModeForRules(rules: SpiteRules): SpiteModeId {
  if (!rules.refillMidTurn) return 'cutthroat';
  return rules.payoffSize <= 12 ? 'quick' : 'classic';
}
