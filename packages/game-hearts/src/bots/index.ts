import type { BotPolicy, PersonaMeta } from '@parlour/engine';
import { easyBot } from './easy';
import { hardBot } from './hard';
import { mediumBot } from './medium';
import type { HeartsState } from '../state';

export { easyBot, makeEasyBot } from './easy';
export { mediumBot } from './medium';
export { hardBot } from './hard';
export {
  choosePassCards,
  duckUnder,
  dumpOrder,
  legalPlayCards,
  pickPlay,
  pointsTakenBy,
  totalPointsTaken,
} from './shared';
export { cardsSeen, passDanger, queenStillOut, spadesSeen } from './evaluate';

/** House personas — names match the shared avatar cast. */
export interface HeartsPersona {
  id: string;
  bot: BotPolicy<HeartsState>;
  meta: PersonaMeta;
}

export const HEARTS_PERSONAS: readonly HeartsPersona[] = [
  {
    id: 'dove',
    bot: easyBot,
    meta: {
      name: 'Dove',
      avatar: 'plum',
      blurb: 'Plays whatever feels nice. Collects hearts like souvenirs.',
      emotes: ['oops', 'hello', 'nice'],
    },
  },
  {
    id: 'flint',
    bot: mediumBot,
    meta: {
      name: 'Flint',
      avatar: 'slate',
      blurb: 'Ducks under every winner and never volunteers the queen.',
      emotes: ['nice', 'hurry'],
    },
  },
  {
    id: 'rose',
    bot: hardBot,
    meta: {
      name: 'Rose',
      avatar: 'marigold',
      blurb: 'Tracks the queen, hunts moons, and blocks yours.',
      emotes: ['wow', 'nice', 'gg'],
    },
  },
  {
    id: 'ash',
    bot: hardBot,
    meta: {
      name: 'Ash',
      avatar: 'cobalt',
      blurb: 'Quietly remembers every void at the table.',
      emotes: ['nice', 'gg'],
    },
  },
];

const BY_ID = new Map(HEARTS_PERSONAS.map((persona) => [persona.id, persona]));

export function heartsPersona(id: string): HeartsPersona {
  const persona = BY_ID.get(id);
  if (!persona) throw new Error(`unknown hearts persona: ${id}`);
  return persona;
}

/** Bot policies for the engine's `bots` slot, weakest first. */
export const HEARTS_BOTS: readonly BotPolicy<HeartsState>[] = [easyBot, mediumBot, hardBot];
