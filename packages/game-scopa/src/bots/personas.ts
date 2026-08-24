import type { BotPolicy } from '@parlour/engine';
import type { ScopaState } from '../state';
import { makePolicy, profileForTier, type BotProfile, type PlayParams } from './index';

export interface PersonaDef {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
  readonly blurb: string;
  readonly emotes: readonly string[];
  readonly tier: 1 | 2 | 3;
  readonly profile: BotProfile;
}

function skew(base: BotProfile, params: Partial<PlayParams>): BotProfile {
  return { ...base, params: { ...base.params, ...params } };
}

const EASY = profileForTier(1);
const MEDIUM = profileForTier(2);
const HARD = profileForTier(3);

export const PERSONAS: readonly PersonaDef[] = [
  {
    id: 'beppino',
    name: 'Beppino',
    avatar: 'plum',
    blurb: 'Takes the biggest pile on the table and worries about points never.',
    emotes: ['eh!', 'che bella', 'another?'],
    tier: 1,
    profile: EASY,
  },
  {
    id: 'rosetta',
    name: 'Rosetta',
    avatar: 'marigold',
    blurb: 'Would trade a scopa for two more coins in the pile. Usually right.',
    emotes: ['mine', 'gold', 'careful'],
    tier: 2,
    profile: skew(MEDIUM, { coin: 3, settebello: 3.5 }),
  },
  {
    id: 'falco',
    name: 'Falco',
    avatar: 'ember',
    blurb: 'Sniffs out every sweep. Leaves bait you should not touch.',
    emotes: ['scopa!', 'sweep', 'too slow'],
    tier: 2,
    profile: skew(MEDIUM, { scopa: 3, risk: 0.5 }),
  },
  {
    id: 'contessa',
    name: 'Contessa',
    avatar: 'cobalt',
    blurb: 'Plays for primiera and protects her sevens like family heirlooms.',
    emotes: ['the seven stays', 'mathematics', 'bravissima'],
    tier: 3,
    profile: skew(HARD, { prime: 2.4, settebello: 3.5, hold: 1.6 }),
  },
  {
    id: 'matteo',
    name: 'Matteo',
    avatar: 'slate',
    blurb: 'Counts all forty cards before touching one. Never leaves you a gift.',
    emotes: ['hm', 'noted', 'deny'],
    tier: 3,
    profile: skew(HARD, { risk: 2.2, jitter: 0.04 }),
  },
  {
    id: 'nina',
    name: 'Nina',
    avatar: 'rust',
    blurb: 'All gas. Poses bold, sweeps often, apologises rarely.',
    emotes: ['boom', 'swept it', 'next!'],
    tier: 3,
    profile: skew(HARD, { scopa: 2.8, risk: 0.7 }),
  },
];

export function personaById(id: string): PersonaDef | undefined {
  return PERSONAS.find((persona) => persona.id === id);
}

export function makePersonaBot(id: string): BotPolicy<ScopaState> & { persona: PersonaDef } {
  const persona = personaById(id);
  if (!persona) throw new Error(`unknown persona: ${id}`);
  const policy = makePolicy(
    `scopa-persona-${persona.id}`,
    persona.name,
    persona.tier,
    persona.profile,
    {
      name: persona.name,
      avatar: persona.avatar,
      blurb: persona.blurb,
      emotes: persona.emotes,
    },
  );
  return { ...policy, persona };
}
