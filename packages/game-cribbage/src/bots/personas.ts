import type { BotPolicy } from '@parlour/engine';
import type { CribbageState } from '../state';
import { EASY_PARAMS, HARD_PARAMS, MEDIUM_PARAMS, type BotParams } from './params';
import { makeEasyBot } from './easy';
import { makeEvalBot } from './evalbot';

/** The six named house characters (spec §9 shape): tier + parameter skews + emotes. */
export interface PersonaDef {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
  readonly blurb: string;
  readonly emotes: readonly string[];
  readonly tier: 1 | 2 | 3;
  readonly params: BotParams;
}

export const PERSONAS: readonly PersonaDef[] = [
  {
    id: 'doc-skunk',
    name: 'Doc Skunk',
    avatar: 'rust',
    blurb: 'Learned cribbage from a matchbook. Still counts on his fingers.',
    emotes: ['is fifteen a lot?', 'whose crib is it?', 'oops'],
    tier: 1,
    params: EASY_PARAMS,
  },
  {
    id: 'peggy-sue',
    name: 'Peggy Sue',
    avatar: 'plum',
    blurb: 'Plays fast, laughs loud, forgets the muggins.',
    emotes: ['wheee', 'go!'],
    tier: 1,
    params: { ...EASY_PARAMS, caution: 0.4 },
  },
  {
    id: 'pubkeeper-otto',
    name: 'Pubkeeper Otto',
    avatar: 'ember',
    blurb: 'Pours the pints and counts the fifteens. Steady as the bar.',
    emotes: ['round on me', 'tidy', 'again?'],
    tier: 2,
    params: MEDIUM_PARAMS,
  },
  {
    id: 'marlow',
    name: 'Marlow',
    avatar: 'cobalt',
    blurb: 'Reads the count like a newspaper. Never hurries.',
    emotes: ['hm.', 'noted', 'as expected'],
    tier: 2,
    params: { ...MEDIUM_PARAMS, caution: 1.1, starterSamples: 24 },
  },
  {
    id: 'countess-vera',
    name: 'Countess Vera',
    avatar: 'juniper',
    blurb: 'Ninety years at the board and she has seen your trick before.',
    emotes: ['charming', 'checkmate, dear'],
    tier: 3,
    params: HARD_PARAMS,
  },
  {
    id: 'sharp-eddie',
    name: 'Sharp Eddie',
    avatar: 'slate',
    blurb: 'Will steal your unclaimed two and call it hospitality.',
    emotes: ['muggins!', 'thank YOU', 'too slow'],
    tier: 3,
    params: { ...HARD_PARAMS, claimRate: 1, stealRate: 1, caution: 1.2 },
  },
];

export function personaById(id: string): PersonaDef | undefined {
  return PERSONAS.find((persona) => persona.id === id);
}

function buildPolicy(persona: PersonaDef): BotPolicy<CribbageState> {
  switch (persona.tier) {
    case 1:
      return makeEasyBot(persona.params, persona.id, persona.name);
    case 2:
      return makeEvalBot(persona.params, 2, persona.id, persona.name);
    case 3:
      return makeEvalBot(persona.params, 3, persona.id, persona.name);
  }
}

/** Persona-backed policy with avatar/emote meta attached for UI seat plaques. */
export function makePersonaBot(id: string): BotPolicy<CribbageState> & { persona: PersonaDef } {
  const persona = personaById(id);
  if (!persona) throw new Error(`unknown cribbage persona: ${id}`);
  return { ...buildPolicy(persona), persona };
}

/** The three difficulty tiers as plain policies (spec §9). */
export const TIER_BOTS: readonly (BotPolicy<CribbageState> & { tier: 1 | 2 | 3 })[] = [
  makeEasyBot(EASY_PARAMS),
  makeEvalBot(MEDIUM_PARAMS, 2, 'cribbage-medium', 'Regular'),
  makeEvalBot(HARD_PARAMS, 3, 'cribbage-hard', 'Sharp'),
];

export function tierBot(tier: 1 | 2 | 3): BotPolicy<CribbageState> & { tier: 1 | 2 | 3 } {
  const bot = TIER_BOTS.find((candidate) => candidate.tier === tier);
  if (!bot) throw new Error(`no cribbage bot policy for tier ${tier}`);
  return bot;
}
