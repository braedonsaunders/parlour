import type { PersonaMeta } from '@parlour/engine';

/**
 * The three named characters at a Crazy Eights table.
 */

export const rookiePersona: PersonaMeta = {
  name: 'Tilly',
  avatar: 'marigold',
  blurb: 'Not entirely sure which card does what, but having a lovely time.',
  emotes: ['what does this one do?', 'oh!', 'your turn!'],
};

export const regularPersona: PersonaMeta = {
  name: 'Hollis',
  avatar: 'slate',
  blurb: 'Keeps a tidy hand. Eight stays in the holster until it has to come out.',
  emotes: ['hm', 'nice one', 'nearly done'],
};

export const sharpPersona: PersonaMeta = {
  name: 'Sable',
  avatar: 'cobalt',
  blurb: 'Reads the table, manages the suit, and never wastes a wild.',
  emotes: ['…', 'got you', 'last one'],
};