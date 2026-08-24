import type { BotPolicy } from '@parlour/engine';
import type { GinState } from '../state';
import { makeEasyBot } from './easy';
import { makeHardBot } from './hard';
import { makeMediumBot } from './medium';
import { EASY_PARAMS, HARD_PARAMS, MEDIUM_PARAMS, type GinBotParams } from './params';

/** The six named characters: tier + parameter skews + emote flavor (spec §9). */
export interface PersonaDef {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
  readonly blurb: string;
  readonly emotes: readonly string[];
  readonly tier: 1 | 2 | 3;
  readonly params: GinBotParams;
}

const EASY_BASE = EASY_PARAMS;
const MEDIUM_BASE = MEDIUM_PARAMS;
const HARD_BASE = HARD_PARAMS;

export const GIN_PERSONAS: readonly PersonaDef[] = [
  {
    id: 'granny-pearl',
    name: 'Granny Pearl',
    avatar: 'peg',
    blurb: 'Only knocks when the kettle is on and the hand is lovely.',
    emotes: ['oh dear', 'beg pardon', 'lovely cards'],
    tier: 1,
    params: { ...EASY_BASE, knockAt: 6 },
  },
  {
    id: 'rookie-rex',
    name: 'Rookie Rex',
    avatar: 'roo',
    blurb: 'Learned gin from a biscuit tin. Enthusiastic about it.',
    emotes: ['which suit?', 'oops', 'gin?? no'],
    tier: 1,
    params: EASY_BASE,
  },
  {
    id: 'steady-marge',
    name: 'Steady Marge',
    avatar: 'marge',
    blurb: 'Reads the pile, plays the odds, no drama.',
    emotes: ['hm', 'alright then'],
    tier: 2,
    params: MEDIUM_BASE,
  },
  {
    id: 'ginny-gin',
    name: 'Ginny Gin',
    avatar: 'benny',
    blurb: 'One card from glory. Usually two cards from disaster.',
    emotes: ['GIN TIME!!', 'sooo close', 'watch this'],
    tier: 2,
    params: { ...MEDIUM_BASE, knockAt: 6, chaseGin: true },
  },
  {
    id: 'knuckles',
    name: 'Knuckles',
    avatar: 'knuckles',
    blurb: 'Knocks first, apologises never.',
    emotes: ['knock knock.', 'next.', 'too slow'],
    tier: 3,
    params: { ...HARD_BASE, knockAt: 10, knockProb: 0.42 },
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

export function ginPersonaById(id: string): PersonaDef | undefined {
  return GIN_PERSONAS.find((persona) => persona.id === id);
}

function buildPolicy(persona: PersonaDef): BotPolicy<GinState> {
  switch (persona.tier) {
    case 1:
      return makeEasyBot(persona.params, persona.id, persona.name);
    case 2:
      return makeMediumBot(persona.params, persona.id, persona.name);
    case 3:
      return makeHardBot(persona.params, persona.id, persona.name);
  }
}

/** The three difficulty tiers as plain policies. */
export const GIN_TIER_BOTS: readonly BotPolicy<GinState>[] = [
  makeEasyBot(EASY_BASE),
  makeMediumBot(MEDIUM_BASE),
  makeHardBot(HARD_BASE),
];

export function ginTierBot(tier: 1 | 2 | 3): BotPolicy<GinState> {
  const bot = GIN_TIER_BOTS[tier - 1];
  if (!bot) throw new Error(`no gin bot policy for tier ${tier}`);
  return bot;
}

/** Persona-backed policy with avatar/emote meta attached for seat plaques. */
export function makeGinPersonaBot(id: string): BotPolicy<GinState> & { persona: PersonaDef } {
  const persona = ginPersonaById(id);
  if (!persona) throw new Error(`unknown gin persona: ${id}`);
  return { ...buildPolicy(persona), persona };
}
