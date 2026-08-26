import type { PersonaMeta } from '@parlour/engine';

/**
 * The three named characters at a President table.
 *
 * Every persona is a distinct playstyle lean on top of a tier, not a separate
 * policy — the tier ladder stays measurable and the personas stay colourful.
 */

export const rookiePersona: PersonaMeta = {
  name: 'Marigold',
  avatar: 'marigold',
  blurb: 'Plays whatever the moment hands her and loves a loud table.',
};

export const regularPersona: PersonaMeta = {
  name: 'Slate',
  avatar: 'slate',
  blurb: 'Counts the table, keeps his pairs intact, never panics.',
};

export const sharpPersona: PersonaMeta = {
  name: 'Juniper',
  avatar: 'juniper',
  blurb: 'Cold math, warm smile, and a 2 saved for exactly the right beat.',
};
