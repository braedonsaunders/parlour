import type { PersonaMeta } from '@parlour/engine';

/** The three named characters at a Durak table. */

export const rookiePersona: PersonaMeta = {
  name: 'Petya',
  avatar: 'marigold',
  blurb: 'Plays whatever is in front of it. Picks up more than it beats.',
  emotes: ['uh oh', 'take it then', 'your go!'],
};

export const regularPersona: PersonaMeta = {
  name: 'Zina',
  avatar: 'slate',
  blurb: 'Beats cheaply, keeps its trumps in the holster until it needs them.',
  emotes: ['hm', "that'll do", 'nearly out'],
};

export const sharpPersona: PersonaMeta = {
  name: 'Volk',
  avatar: 'cobalt',
  blurb: 'Piles on duplicates to pin the defender, and never wastes a trump.',
  emotes: ['…', 'beat that', 'last card'],
};
