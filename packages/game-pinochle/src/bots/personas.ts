import type { BotPolicy, PersonaMeta } from '@parlour/engine';
import type { PinochleState } from '../state';
import { EASY_PROFILE, HARD_PROFILE, MEDIUM_PROFILE, makePolicy, type BotProfile } from './index';
import type { BidParams } from './bid';
import type { PlayParams } from './play';

export interface PersonaDef {
  id: string;
  name: string;
  avatar: string;
  blurb: string;
  emotes?: readonly string[];
  tier: 1 | 2 | 3;
  profile: BotProfile;
}

function skew(
  base: BotProfile,
  bid: Partial<BidParams> = {},
  play: Partial<PlayParams> = {},
): BotProfile {
  return { bid: { ...base.bid, ...bid }, play: { ...base.play, ...play } };
}

export const PERSONAS: readonly PersonaDef[] = [
  {
    id: 'gert',
    name: 'Gert',
    avatar: 'plum',
    blurb: 'Bids cautious and never chases a hand she can’t make.',
    tier: 1,
    profile: skew(EASY_PROFILE, { bidCeilingFactor: 0.7 }),
  },
  {
    id: 'moe',
    name: 'Moe',
    avatar: 'ember',
    blurb: 'Never met a bid he wouldn’t chase.',
    tier: 1,
    profile: skew(EASY_PROFILE, { bidCeilingFactor: 0.95, jitterAmount: 8 }),
  },
  {
    id: 'dot',
    name: 'Dot',
    avatar: 'marigold',
    blurb: 'Counts trump before the cards even settle.',
    tier: 2,
    profile: MEDIUM_PROFILE,
  },
  {
    id: 'earl',
    name: 'Earl',
    avatar: 'slate',
    blurb: 'Ducks to his partner every chance he gets.',
    tier: 2,
    profile: skew(MEDIUM_PROFILE, {}, { duckToPartner: 0.9 }),
  },
  {
    id: 'vinny',
    name: 'Vinny',
    avatar: 'teal',
    blurb: 'Leads trump early to shake the table loose.',
    tier: 3,
    profile: skew(HARD_PROFILE, {}, { leadTrumpAggression: 0.7 }),
  },
  {
    id: 'roxie',
    name: 'Roxie',
    avatar: 'crimson',
    blurb: 'Reads the bid and never overpays for it.',
    tier: 3,
    profile: skew(HARD_PROFILE, { bidCeilingFactor: 1.05, jitterAmount: 0.5 }),
  },
];

export function personaById(id: string): PersonaDef | undefined {
  return PERSONAS.find((persona) => persona.id === id);
}

export function makePersonaBot(id: string): BotPolicy<PinochleState> {
  const persona = personaById(id);
  if (!persona) throw new Error(`makePersonaBot: unknown persona ${id}`);
  const meta: PersonaMeta = {
    name: persona.name,
    avatar: persona.avatar,
    blurb: persona.blurb,
    emotes: persona.emotes,
  };
  return makePolicy(
    `pinochle-persona-${persona.id}`,
    persona.name,
    persona.tier,
    persona.profile,
    meta,
  );
}
