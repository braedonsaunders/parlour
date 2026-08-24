import type { SpiteRules } from '@parlour/game-spite';

export type SpiteModeId = 'classic' | 'quick' | 'cutthroat';

/**
 * Spite & Malice table settings — presentation for the pack's config presets.
 * Rule values live in the package schema; this mirrors lib/spades/modes.ts.
 */
export interface SpiteModeDef {
  id: SpiteModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

export const SPITE_MODES: readonly SpiteModeDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Twenty deep',
    description:
      'The full pile: twenty cards to shed before anyone else. Long enough that a bad start is recoverable and a good one still has to be finished.',
    facts: ['20-card payoff', 'kings wild', '~15 min'],
    accent: '#3f6f5c',
    shade: '#1d3a30',
  },
  {
    id: 'quick',
    name: 'Quick',
    tagline: 'Ten and out',
    description:
      'Half the pile, twice the pace. Every card off the payoff is a tenth of the game, so there is no time to sit on a wild.',
    facts: ['10-card payoff', 'kings wild', '~7 min'],
    accent: '#e29349',
    shade: '#96471c',
  },
  {
    id: 'cutthroat',
    name: 'Cutthroat',
    tagline: 'No second wind',
    description:
      'Thirteen cards, and emptying your hand mid-turn does not refill it. You get the five you were dealt and no more until the turn is over.',
    facts: ['13-card payoff', 'no mid-turn refill', 'harsh'],
    accent: '#7b3d55',
    shade: '#3c1c2c',
  },
];

const BY_ID = new Map(SPITE_MODES.map((mode) => [mode.id, mode]));

export function getSpiteMode(id: SpiteModeId): SpiteModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown spite mode id: ${id}`);
  return mode;
}

export function isSpiteModeId(value: unknown): value is SpiteModeId {
  return typeof value === 'string' && BY_ID.has(value as SpiteModeId);
}

/**
 * Maps resolved rule values back to the presentation preset, for match records.
 *
 * Cutthroat is the only preset that turns the mid-turn refill off, and Quick is
 * the only one that shortens the payoff to ten — so the checks read in order of
 * how specific they are.
 */
export function spiteModeForRules(rules: SpiteRules): SpiteModeId {
  if (!rules.refillMidTurn) return 'cutthroat';
  return rules.payoffSize <= 10 ? 'quick' : 'classic';
}
