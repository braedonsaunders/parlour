import type { BotPolicy } from '@parlour/engine';
import type { EuchreState } from '../state';
import { makePolicy, profileForTier, type BotProfile } from './index';

/** The six named characters (spec §9): tier + parameter skews + emote flavor. */
export interface PersonaDef {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
  readonly blurb: string;
  readonly emotes: readonly string[];
  readonly tier: 1 | 2 | 3;
  readonly profile: BotProfile;
}

function skew(
  base: BotProfile,
  bid: Partial<BotProfile['bid']>,
  play: Partial<BotProfile['play']>,
): BotProfile {
  return { bid: { ...base.bid, ...bid }, play: { ...base.play, ...play } };
}

const EASY = profileForTier(1);
const MEDIUM = profileForTier(2);
const HARD = profileForTier(3);

export const PERSONAS: readonly PersonaDef[] = [
  {
    id: 'gus',
    name: 'Gus',
    avatar: 'slate',
    blurb: 'Learned euchre at the VFW. Mostly remembers the bowers.',
    emotes: ['huh', 'which jack?', 'oops'],
    tier: 1,
    profile: EASY,
  },
  {
    id: 'dot',
    name: 'Dot',
    avatar: 'marigold',
    blurb: 'Orders it up when she is good and ready, thank you.',
    emotes: ['oh dear', 'sorry, dear', 'beg pardon'],
    tier: 2,
    profile: skew(
      MEDIUM,
      { orderUpMin: 5.8, callMin: 5.4, aloneMin: Number.POSITIVE_INFINITY },
      {},
    ),
  },
  {
    id: 'marge',
    name: 'Steady Marge',
    avatar: 'plum',
    blurb: 'Textbook club player. Reads the table, plays the odds.',
    emotes: ['hm', 'alright then'],
    tier: 2,
    profile: MEDIUM,
  },
  {
    id: 'earl',
    name: 'Earl',
    avatar: 'rust',
    blurb: 'Retired grinder. Never met a pass he regretted.',
    emotes: ['nope', 'not today', 'safe is smart'],
    tier: 2,
    profile: skew(
      MEDIUM,
      { orderUpMin: 6.1, callMin: 5.7, aloneMin: Number.POSITIVE_INFINITY },
      {
        eagerRuff: false,
      },
    ),
  },
  {
    id: 'vinny',
    name: 'Vinny',
    avatar: 'ember',
    blurb: 'Orders from any seat with anything. Chaos has a partner.',
    emotes: ['pick it up!', "I'll take that", "let's go"],
    tier: 3,
    profile: skew(
      HARD,
      { orderUpMin: 4.4, callMin: 4.3, aloneMin: 8.0 },
      { leadTrumpAggression: 3 },
    ),
  },
  {
    id: 'roxie',
    name: 'Roxie',
    avatar: 'cobalt',
    blurb: 'Club shark. Tight pre-call, merciless after.',
    emotes: ['called it', '…', 'bowers first'],
    tier: 3,
    profile: skew(HARD, { orderUpMin: 5.4, callMin: 5.1, aloneMin: 8.2 }, {}),
  },
];

export function personaById(id: string): PersonaDef | undefined {
  return PERSONAS.find((persona) => persona.id === id);
}

/** Persona-backed policy with avatar/emote meta attached for UI seat plaques. */
export function makePersonaBot(id: string): BotPolicy<EuchreState> & { persona: PersonaDef } {
  const persona = personaById(id);
  if (!persona) throw new Error(`unknown persona: ${id}`);
  const policy = makePolicy(
    `euchre-persona-${persona.id}`,
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
