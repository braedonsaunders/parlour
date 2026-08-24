import type { BotPolicy } from '@parlour/engine';
import type { SpadesState } from '../state';
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
    id: 'penny',
    name: 'Penny',
    avatar: 'plum',
    blurb: 'Bids like the cards are already in the book. They are not.',
    emotes: ['oops', 'hello', 'nice'],
    tier: 1,
    profile: EASY,
  },
  {
    id: 'cal',
    name: 'Cal',
    avatar: 'slate',
    blurb: 'Counts his books twice and still underbids by one.',
    emotes: ['hm', 'alright then'],
    tier: 2,
    profile: skew(MEDIUM, { aggression: -0.2, bagFear: 7 }, {}),
  },
  {
    id: 'dot',
    name: 'Dot',
    avatar: 'marigold',
    blurb: 'Will bid nil on a hunch and then apologize the whole hand.',
    emotes: ['oh dear', 'sorry, dear', 'beg pardon'],
    tier: 2,
    profile: skew(MEDIUM, { nilMax: 1.1, nilSpadeCap: 2 }, { protectNil: true }),
  },
  {
    id: 'rex',
    name: 'Rex',
    avatar: 'ember',
    blurb: 'Leads trump for sport. Bags are a problem for later.',
    emotes: ['let’s go', 'mine', 'come on'],
    tier: 3,
    profile: skew(HARD, { aggression: 0.35, bagFear: 10 }, { bagAvoid: false, eagerRuff: true }),
  },
  {
    id: 'ivy',
    name: 'Ivy',
    avatar: 'cobalt',
    blurb: 'Manages bags like a ledger. Never takes the tenth if she can help it.',
    emotes: ['nice', 'gg', '…'],
    tier: 3,
    profile: HARD,
  },
  {
    id: 'niles',
    name: 'Niles',
    avatar: 'rust',
    blurb: 'Lives for the nil. Covers his partner like a hawk.',
    emotes: ['shh', 'I’ve got you', 'nil'],
    tier: 3,
    profile: skew(HARD, { nilMax: 1.2, nilSpadeCap: 3 }, { coverPartner: true, protectNil: true }),
  },
];

export function personaById(id: string): PersonaDef | undefined {
  return PERSONAS.find((persona) => persona.id === id);
}

export function makePersonaBot(id: string): BotPolicy<SpadesState> & { persona: PersonaDef } {
  const persona = personaById(id);
  if (!persona) throw new Error(`unknown persona: ${id}`);
  const policy = makePolicy(`spades-persona-${persona.id}`, persona.name, persona.tier, persona.profile, {
    name: persona.name,
    avatar: persona.avatar,
    blurb: persona.blurb,
    emotes: persona.emotes,
  });
  return { ...policy, persona };
}
