import { defineConfig, type ConfigFieldValue } from '@parlour/engine';

export type HandArc = 'updown' | 'up' | 'down';
export type ScoringScheme = 'exactOnly' | 'penalty' | 'plusOne';

/**
 * Oh Hell rule values. `handSize` and `dealer` describe ONE round; a match's
 * scheduler (see schedule.ts / match.ts) rewrites both for every round via
 * MatchDef.roundConfig — the settings panel exposes them only so a
 * standalone single-round table has something to stand on.
 */
export interface OhHellRules {
  /** cards dealt to each player this round */
  handSize: number;
  /** seat that deals this round; bidding starts left of them */
  dealer: number;
  /** shape of the hand-size arc across a match */
  handArc: HandArc;
  /** largest hand the arc reaches, clamped to what the deck allows */
  maxHand: number;
  /** the dealer may not make the total bid equal the tricks available */
  hookRule: boolean;
  scoring: ScoringScheme;
  /** Wizard variant: 4 Wizards + 4 Jesters join the deck (60 cards) */
  wizards: boolean;
  /** full-deck rounds cut a trump from the bottom instead of playing no-trump */
  trumpOnLastRound: boolean;
  [key: string]: ConfigFieldValue;
}

export const HAND_ARCS: readonly { value: HandArc; label: string }[] = [
  { value: 'updown', label: 'Up and down — 1…peak…1' },
  { value: 'up', label: 'Up only — 1…peak' },
  { value: 'down', label: 'Down only — peak…1' },
];

export const SCORING_SCHEMES: readonly { value: ScoringScheme; label: string }[] = [
  { value: 'exactOnly', label: 'Exact only — 10 + bid or nothing' },
  { value: 'penalty', label: 'Penalty — miss by n, lose n' },
  { value: 'plusOne', label: 'Plus one — double the bid on a make' },
];

const FIELD_MAX_HAND = 20;

export const ohhellConfig = defineConfig<OhHellRules>(
  [
    {
      key: 'handSize',
      kind: 'int',
      label: 'Cards in hand',
      group: 'Match',
      min: 1,
      max: FIELD_MAX_HAND,
      default: 8,
      help: 'Cards dealt to each player this round. A full match sets this automatically for every round.',
    },
    {
      key: 'dealer',
      kind: 'int',
      label: 'Dealer seat',
      group: 'Match',
      min: 0,
      max: 6,
      default: 0,
      help: 'Seat that deals this round and bids last. A full match rotates the deal every round.',
    },
    {
      key: 'handArc',
      kind: 'enum',
      label: 'Hand arc',
      group: 'Match',
      options: HAND_ARCS.map(({ value, label }) => ({ value, label })),
      default: 'updown',
      help: 'How hand sizes move across a match: ramp up then down, up only, or deal big and shrink.',
    },
    {
      key: 'maxHand',
      kind: 'int',
      label: 'Largest hand',
      group: 'Match',
      min: 1,
      max: FIELD_MAX_HAND,
      default: 9,
      help: 'The arc never deals more than this — clamped so every round keeps a card to turn for trump.',
    },
    {
      key: 'hookRule',
      kind: 'toggle',
      label: 'Hook rule',
      group: 'Bidding',
      default: true,
      help: 'Screw the dealer: the last bid may not make the total exactly equal the tricks available, so someone always misses.',
    },
    {
      key: 'scoring',
      kind: 'enum',
      label: 'Scoring',
      group: 'Scoring',
      options: SCORING_SCHEMES.map(({ value, label }) => ({ value, label })),
      default: 'exactOnly',
      help: 'Make your bid exactly to score. The schemes differ on what a miss costs.',
    },
    {
      key: 'wizards',
      kind: 'toggle',
      label: 'Wizards & Jesters',
      group: 'Advanced',
      advanced: true,
      default: false,
      help: 'Add four Wizards (always win) and four Jesters (always lose) — a 60-card deck.',
    },
    {
      key: 'trumpOnLastRound',
      kind: 'toggle',
      label: 'Cut trump on full-deck rounds',
      group: 'Advanced',
      advanced: true,
      default: false,
      help: 'When a round would deal the whole deck, cut a trump from the bottom first (hands shrink by one) instead of playing no-trump.',
    },
  ],
  [
    { id: 'classic', label: 'Classic', values: {} },
    { id: 'quick', label: 'Quick', values: { handArc: 'down', maxHand: 5 } },
    { id: 'wizard', label: 'Wizard', values: { wizards: true } },
  ],
);
