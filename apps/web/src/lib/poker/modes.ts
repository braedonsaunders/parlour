import type { PokerRules } from '@parlour/game-poker';

export type PokerModeId = 'classic' | 'turbo' | 'deep';

export interface PokerModeDef {
  id: PokerModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

/**
 * Poker's table settings — presentation for @parlour/game-poker's config
 * presets. Rule values live in the package schema; this catalog mirrors
 * lib/spades/modes.ts.
 */
export const POKER_MODES: readonly PokerModeDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'The full table',
    description:
      'Three thousand chips each and blinds that climb every eight hands. Room to play a hand out before anyone is committed.',
    facts: ['3,000 chips', 'blinds every 8', '~25 min'],
    accent: '#2f6b48',
    shade: '#17351f',
  },
  {
    id: 'turbo',
    name: 'Turbo',
    tagline: 'Shove or go home',
    description:
      'Short stacks and blinds that climb every four hands. Nobody gets to wait for aces.',
    facts: ['1,500 chips', 'blinds every 4', '~10 min'],
    accent: '#e29349',
    shade: '#96471c',
  },
  {
    id: 'deep',
    name: 'Deep Stack',
    tagline: 'Play the player',
    description:
      'Six thousand chips and a slow ladder, antes off. The long game, where position and patience are worth something.',
    facts: ['6,000 chips', 'blinds every 12', 'no ante'],
    accent: '#4ba1ba',
    shade: '#25586e',
  },
];

/** A poker match runs long; used to time the tense music cue. */
export const POKER_MATCH_PACE_MS = 1_500_000;

const BY_ID = new Map(POKER_MODES.map((mode) => [mode.id, mode]));

export function getPokerMode(id: PokerModeId): PokerModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown poker mode id: ${id}`);
  return mode;
}

export function isPokerModeId(value: unknown): value is PokerModeId {
  return typeof value === 'string' && BY_ID.has(value as PokerModeId);
}

/**
 * Maps resolved rule values back to the presentation preset, for records.
 *
 * The three presets are separated by their starting stack alone, which is the
 * one field none of them share.
 */
export function pokerModeForRules(rules: PokerRules): PokerModeId {
  if (rules.startingStack === 1500) return 'turbo';
  if (rules.startingStack === 6000) return 'deep';
  return 'classic';
}

/** Chip counts read better grouped: 12,450 rather than 12450. */
export function formatChips(amount: number): string {
  return amount.toLocaleString('en-US');
}
