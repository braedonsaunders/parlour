import type { BotPolicy } from '@parlour/engine';
import type { BlitzState } from '../state';
import { HARD_BOT_DEFAULTS, type BotParams } from './shared';
import { makeEasyBot } from './easy';
import { makeMediumBot } from './medium';
import { makeHardBot } from './hard';

/** The six named characters (spec §9): tier + parameter skews + emote flavor. */
export interface PersonaDef {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
  readonly blurb: string;
  readonly emotes: readonly string[];
  readonly tier: 1 | 2 | 3;
  readonly params: BotParams;
}

const EASY_BASE: BotParams = {
  knockAt: 28,
  knockProb: null,
  opponentUplift: 0,
  memory: 0,
  chaseBlitz: false,
  denial: 0,
  curationBias: 0,
  hard: HARD_BOT_DEFAULTS,
};

const MEDIUM_BASE: BotParams = {
  knockAt: 23,
  knockProb: null,
  opponentUplift: 0,
  memory: 0.7,
  chaseBlitz: false,
  denial: 0.3,
  curationBias: 1,
  hard: HARD_BOT_DEFAULTS,
};

const HARD_BASE: BotParams = {
  knockAt: 25,
  knockProb: 0.92,
  opponentUplift: 1,
  memory: 1.5,
  chaseBlitz: true,
  denial: 1.5,
  curationBias: 2,
  hard: HARD_BOT_DEFAULTS,
};

export const PERSONAS: readonly PersonaDef[] = [
  {
    id: 'rookie-roo',
    name: 'Rookie Roo',
    avatar: 'roo',
    blurb: 'Learned the rules on Tuesday. Mostly.',
    emotes: ['oh!', 'which suit again?', 'oops'],
    tier: 1,
    params: EASY_BASE,
  },
  {
    id: 'nan-peg',
    name: 'Nan Peg',
    avatar: 'peg',
    blurb: 'Knocks when she is good and ready, thank you.',
    emotes: ['oh dear', 'sorry, dear', 'beg pardon'],
    tier: 2,
    params: { ...MEDIUM_BASE, knockAt: 26, memory: 0.9 },
  },
  {
    id: 'steady-marge',
    name: 'Steady Marge',
    avatar: 'marge',
    blurb: 'Reads the table, plays the odds, no drama.',
    emotes: ['hm', 'alright then'],
    tier: 2,
    params: MEDIUM_BASE,
  },
  {
    id: 'benny-blitz',
    name: 'Benny Blitz',
    avatar: 'benny',
    blurb: 'One card from glory. Always one card from disaster.',
    emotes: ['BLITZ TIME!!', 'sooo close', 'watch this'],
    tier: 2,
    params: { ...MEDIUM_BASE, knockAt: 24, chaseBlitz: true },
  },
  {
    id: 'knuckles',
    name: 'Knuckles',
    avatar: 'knuckles',
    blurb: 'Knocks first, apologises never.',
    emotes: ['knock knock.', 'next.', 'too slow'],
    tier: 3,
    params: { ...HARD_BASE, knockAt: 22, knockProb: 0.6 },
  },
  {
    id: 'poker-pat',
    name: 'Poker Pat',
    avatar: 'pat',
    blurb: 'Median everything. Unbeatable average night.',
    emotes: ['…', 'called it'],
    tier: 3,
    params: HARD_BASE,
  },
];

export function personaById(id: string): PersonaDef | undefined {
  return PERSONAS.find((p) => p.id === id);
}

function buildPolicy(persona: PersonaDef): BotPolicy<BlitzState> {
  switch (persona.tier) {
    case 1:
      return makeEasyBot(persona.params, persona.id, persona.name);
    case 2:
      return makeMediumBot(persona.params, persona.id, persona.name);
    case 3:
      return makeHardBot(persona.params, persona.id, persona.name);
  }
}

/** The three difficulty tiers as plain policies (spec §2/§9). */
export const TIER_BOTS: readonly (BotPolicy<BlitzState> & { tier: 1 | 2 | 3 })[] = [
  makeEasyBot(EASY_BASE),
  makeMediumBot(MEDIUM_BASE),
  makeHardBot(HARD_BASE),
];

export function tierBot(tier: 1 | 2 | 3): BotPolicy<BlitzState> {
  const bot = TIER_BOTS.find((b) => b.tier === tier);
  if (!bot) throw new Error(`no bot policy for tier ${tier}`);
  return bot;
}

/** Persona-backed policy with avatar/emote meta attached for UI seat plaques. */
export function makePersonaBot(id: string): BotPolicy<BlitzState> & { persona: PersonaDef } {
  const persona = personaById(id);
  if (!persona) throw new Error(`unknown persona: ${id}`);
  return { ...buildPolicy(persona), persona };
}
