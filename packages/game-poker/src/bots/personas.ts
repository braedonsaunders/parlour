import type { BotPolicy } from '@parlour/engine';
import type { PokerState } from '../state';
import { makePolicy, profileForTier, type BotProfile } from './index';

export interface PersonaDef {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
  readonly blurb: string;
  readonly emotes: readonly string[];
  readonly tier: 1 | 2 | 3;
  readonly profile: BotProfile;
}

function skew(base: BotProfile, changes: Partial<BotProfile>): BotProfile {
  return { ...base, ...changes };
}

const EASY = profileForTier(1);
const MEDIUM = profileForTier(2);
const HARD = profileForTier(3);

/**
 * Poker is the one game on the shelf where temperament *is* the strategy, so
 * the personas lean harder than elsewhere: the same tier can be a calling
 * station or a maniac, and both are beatable in different ways.
 */
export const PERSONAS: readonly PersonaDef[] = [
  {
    id: 'marge',
    name: 'Marge',
    avatar: 'marigold',
    blurb: 'Has not folded since the Carter administration.',
    emotes: ['well now', 'call', 'hm'],
    tier: 1,
    profile: skew(EASY, { callMargin: -0.22, bluff: 0.01, aggression: 0.2 }),
  },
  {
    id: 'roo',
    name: 'Roo',
    avatar: 'ember',
    blurb: 'Raises first, counts the pot later, apologises never.',
    emotes: ['boom', 'oops', 'nice'],
    tier: 1,
    profile: skew(EASY, {
      aggression: 0.85,
      bluff: 0.24,
      preflopRaiseRatio: 0.12,
      postflopRaiseRatio: 0.16,
    }),
  },
  {
    id: 'peg',
    name: 'Peg',
    avatar: 'juniper',
    blurb: 'Plays the odds, the position, and absolutely nothing else.',
    emotes: ['fair', 'hm', 'go on'],
    tier: 2,
    profile: skew(MEDIUM, { bluff: 0.03, entryRatio: 0.07 }),
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    avatar: 'cobalt',
    blurb: 'Quiet all night, then takes your whole stack on the river.',
    emotes: ['...', 'go on', 'well played'],
    tier: 2,
    profile: skew(MEDIUM, { aggression: 0.7, postflopRaiseRatio: 0.36 }),
  },
  {
    id: 'sable',
    name: 'Sable',
    avatar: 'plum',
    blurb: 'Knows what you have. Bets it anyway, slightly too much.',
    emotes: ['well played', 'hm', 'boom'],
    tier: 3,
    profile: skew(HARD, { bluff: 0.26, aggression: 0.85 }),
  },
  {
    id: 'walt',
    name: 'Walt',
    avatar: 'slate',
    blurb: 'Folds all evening and leaves with the money.',
    emotes: ['fair', 'no thanks', 'well played'],
    tier: 3,
    profile: skew(HARD, { entryRatio: 0.11, callMargin: 0.07, bluff: 0.08 }),
  },
];

export function makePersonaBot(persona: PersonaDef): BotPolicy<PokerState> {
  return makePolicy(persona.id, persona.name, persona.tier, persona.profile, {
    name: persona.name,
    avatar: persona.avatar,
    blurb: persona.blurb,
    emotes: persona.emotes,
  });
}

export function personaById(id: string): PersonaDef | undefined {
  return PERSONAS.find((persona) => persona.id === id);
}

export const PERSONA_BOTS: readonly BotPolicy<PokerState>[] = PERSONAS.map(makePersonaBot);
