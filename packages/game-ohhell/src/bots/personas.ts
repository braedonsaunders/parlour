import type { BotPolicy } from '@parlour/engine';
import type { OhHellState } from '../state';
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
    id: 'pip',
    name: 'Pip',
    avatar: 'plum',
    blurb: 'Counts aces, shrugs, and says a number. Sometimes it even works out.',
    emotes: ['oh well', 'here goes', 'oops'],
    tier: 1,
    profile: EASY,
  },
  {
    id: 'bruno',
    name: 'Bruno',
    avatar: 'ember',
    blurb: 'Bids what the hand could do on its best day. This is not its best day.',
    emotes: ['watch this', 'mine', 'again!'],
    tier: 2,
    profile: skew(MEDIUM, { aggression: 0.5 }, {}),
  },
  {
    id: 'mina',
    name: 'Mina',
    avatar: 'slate',
    blurb: 'Underbids by one and calls it insurance. The hook rule calls it dinner.',
    emotes: ['hm', 'patience', 'as predicted'],
    tier: 2,
    profile: skew(MEDIUM, { aggression: -0.45 }, {}),
  },
  {
    id: 'otto',
    name: 'Otto',
    avatar: 'cobalt',
    blurb: 'Prices every card like a ledger line. The bid is the sum. The sum is exact.',
    emotes: ['calculated', '…', 'inevitable'],
    tier: 3,
    profile: skew(HARD, { jitter: 0 }, {}),
  },
  {
    id: 'vega',
    name: 'Vega',
    avatar: 'marigold',
    blurb: 'Screws the dealer back. Never lets the bids come out level on purpose.',
    emotes: ['not tonight', 'hooked!', 'your move'],
    tier: 3,
    profile: skew(HARD, { aggression: 0.15 }, {}),
  },
  {
    id: 'juno',
    name: 'Juno',
    avatar: 'rust',
    blurb: 'Hoards Wizards like souvenirs and only spends them when it matters.',
    emotes: ['not yet', 'now.', 'saved it'],
    tier: 3,
    profile: skew(HARD, {}, { holdWizards: true }),
  },
];

export function personaById(id: string): PersonaDef | undefined {
  return PERSONAS.find((persona) => persona.id === id);
}

export function makePersonaBot(id: string): BotPolicy<OhHellState> & { persona: PersonaDef } {
  const persona = personaById(id);
  if (!persona) throw new Error(`unknown persona: ${id}`);
  const policy = makePolicy(
    `ohhell-persona-${persona.id}`,
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
