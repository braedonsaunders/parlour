import type { PersonaMeta } from '@parlour/engine';

/**
 * The three named characters at a Palace table.
 *
 * Every persona is a distinct playstyle lean on top of a tier, not a separate
 * policy — the tier ladder stays measurable and the personas stay colourful.
 */

export const rookiePersona: PersonaMeta = {
  name: 'Pip',
  avatar: 'mint',
  blurb: 'Plays the first card that fits and hopes for the best.',
};

export const regularPersona: PersonaMeta = {
  name: 'Hazel',
  avatar: 'marigold',
  blurb: 'Spends low cards first and keeps a ten in her back pocket.',
};

export const sharpPersona: PersonaMeta = {
  name: 'Corvin',
  avatar: 'slate',
  blurb: 'Counts the burn pile, times every special, never wastes a two.',
};
