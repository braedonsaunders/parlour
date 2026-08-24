import type { BotPolicy } from '@parlour/engine';
import type { SpiteState } from '../state';
import { makeEasyBot } from './easy';
import { makeMediumBot } from './medium';
import { makeHardBot } from './hard';
import { EASY_PARAMS, HARD_PARAMS, MEDIUM_PARAMS, type BotParams } from './shared';

export interface PersonaDef {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
  readonly blurb: string;
  readonly emotes: readonly string[];
  readonly tier: 1 | 2 | 3;
  readonly params: BotParams;
}

function skew(base: BotParams, over: Partial<BotParams>): BotParams {
  return { ...base, ...over };
}

/**
 * Six regulars, each with a different idea of what a discard pile is for.
 */
export const PERSONAS: readonly PersonaDef[] = [
  {
    id: 'mabel',
    name: 'Mabel',
    avatar: 'plum',
    blurb: 'Discards by vibe. Occasionally the vibe is correct.',
    emotes: ['oh!', 'lovely', 'oops'],
    tier: 1,
    params: EASY_PARAMS,
  },
  {
    id: 'old-tom',
    name: 'Old Tom',
    avatar: 'slate',
    blurb: 'Keeps his discard piles tidier than most people keep their houses.',
    emotes: ['hm', 'in a minute'],
    tier: 2,
    params: skew(MEDIUM_PARAMS, { runKeep: 14, noise: 1 }),
  },
  {
    id: 'ricky',
    name: 'Ricky',
    avatar: 'ember',
    blurb: 'Fires wilds on turn one. Every game. On purpose, he says.',
    emotes: ['watch this', 'boom', 'again!'],
    tier: 2,
    params: skew(MEDIUM_PARAMS, { wildHold: 0, noise: 9 }),
  },
  {
    id: 'prudence',
    name: 'Prudence',
    avatar: 'cobalt',
    blurb: 'A wild in hand is worth three on the pile. She counted.',
    emotes: ['patience', 'not yet', 'there'],
    tier: 3,
    params: skew(HARD_PARAMS, { wildHold: 130, runKeep: 20, noise: 0 }),
  },
  {
    id: 'vera',
    name: 'Nan Vera',
    avatar: 'marigold',
    blurb: 'Plays her payoff pile like a metronome. You will not notice until she wins.',
    emotes: ['there we are', 'lovely', 'your turn, dear'],
    tier: 3,
    params: HARD_PARAMS,
  },
  {
    id: 'mal',
    name: 'Mal',
    avatar: 'rust',
    blurb: 'Named for it. Leaves every centre pile one card short of your dreams.',
    emotes: ['spited.', 'as planned', 'take what’s yours'],
    tier: 3,
    params: skew(HARD_PARAMS, { blockAwareness: 45, payoffDrive: 50 }),
  },
];

export function personaById(id: string): PersonaDef | undefined {
  return PERSONAS.find((persona) => persona.id === id);
}

function buildPolicy(persona: PersonaDef): BotPolicy<SpiteState> {
  switch (persona.tier) {
    case 1:
      return makeEasyBot(persona.params, `spite-persona-${persona.id}`, persona.name);
    case 2:
      return makeMediumBot(persona.params, `spite-persona-${persona.id}`, persona.name);
    case 3:
      return makeHardBot(persona.params, `spite-persona-${persona.id}`, persona.name);
  }
}

/** The three difficulty tiers as plain policies (spec §9). */
export const SPITE_BOTS: readonly BotPolicy<SpiteState>[] = [
  makeEasyBot(),
  makeMediumBot(),
  makeHardBot(),
];

export function spiteTierBot(tier: 1 | 2 | 3): BotPolicy<SpiteState> {
  const bot = SPITE_BOTS[tier - 1];
  if (!bot) throw new Error(`no bot policy for tier ${tier}`);
  return bot;
}

/** Persona-backed policy with avatar/emote meta attached for UI seat plaques. */
export function makePersonaBot(id: string): BotPolicy<SpiteState> & { persona: PersonaDef } {
  const persona = personaById(id);
  if (!persona) throw new Error(`unknown persona: ${id}`);
  return { ...buildPolicy(persona), persona };
}
