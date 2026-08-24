import { defineConfig } from '@parlour/engine';
import type { RuleValues } from '@parlour/engine';

/**
 * Spite & Malice house rules. Every field is load-bearing in play — the
 * generated settings panel is built from the same list, so nothing here may be
 * added without a rule that reads it.
 */
export interface SpiteRules extends RuleValues {
  /** Cards buried face-down in each seat's payoff pile (classic 20). */
  payoffSize: number;
  /** Cards dealt to each seat, refilled to at the start of every turn. */
  handSize: number;
  /** Discard piles in front of each seat. */
  discardPiles: number;
  /** Shared centre build piles. */
  buildPiles: number;
  /** Deal the Kings; they are wild. Off leaves them out of the shuffle. */
  kingsWild: boolean;
  /** Deal the Jokers; they are wild too. Off leaves them out of the shuffle. */
  jokersWild: boolean;
  /**
   * Empty your hand mid-turn and it refills to full immediately. Off makes the
   * game much harsher: an emptied hand plays on from payoff and discard tops
   * only, and the turn can no longer end with a discard.
   */
  refillMidTurn: boolean;
}

export const spiteConfig = defineConfig<SpiteRules>(
  [
    {
      key: 'payoffSize',
      kind: 'int',
      label: 'Payoff pile',
      min: 5,
      max: 25,
      default: 20,
      group: 'The deal',
      help: 'Cards buried in each payoff pile. Clear yours to win — smaller numbers make shorter games.',
    },
    {
      key: 'handSize',
      kind: 'int',
      label: 'Cards dealt',
      min: 3,
      max: 7,
      default: 5,
      group: 'The deal',
      help: 'Hand size, topped back up at the start of each turn.',
    },
    {
      key: 'discardPiles',
      kind: 'int',
      label: 'Discard piles',
      min: 2,
      max: 6,
      default: 4,
      group: 'The deal',
      help: 'Piles in front of each player. Ending a turn means discarding onto one.',
    },
    {
      key: 'kingsWild',
      kind: 'toggle',
      label: 'Kings are wild',
      default: true,
      group: 'Wilds',
      help: 'A King stands for any rank you name. Off deals no Kings at all.',
    },
    {
      key: 'jokersWild',
      kind: 'toggle',
      label: 'Jokers are wild',
      default: true,
      group: 'Wilds',
      help: 'Jokers play exactly like Kings. Off deals none.',
    },
    {
      key: 'buildPiles',
      kind: 'int',
      label: 'Centre piles',
      min: 2,
      max: 5,
      default: 4,
      advanced: true,
      group: 'The centre',
      help: 'Shared build piles everyone plays onto. Fewer means more waiting on other people’s Aces.',
    },
    {
      key: 'refillMidTurn',
      kind: 'toggle',
      label: 'Refill mid-turn',
      default: true,
      advanced: true,
      group: 'House rules',
      help: 'Empty your hand and it tops back up to five so you keep going. Off is cutthroat.',
    },
  ],
  [
    {
      id: 'classic',
      label: 'Classic',
      values: {},
    },
    {
      id: 'quick',
      label: 'Quick',
      values: { payoffSize: 10 },
    },
    {
      id: 'cutthroat',
      label: 'Cutthroat',
      values: { payoffSize: 13, refillMidTurn: false },
    },
  ],
);
