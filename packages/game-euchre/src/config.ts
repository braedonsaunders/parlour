import { defineConfig, type ConfigFieldValue } from '@parlour/engine';

export interface EuchreRules {
  /** team score that ends the match */
  targetScore: 5 | 10 | 15;
  /** round 2: the dealer must name a suit once everyone else has passed */
  stickDealer: boolean;
  /** allow the caller to play the hand alone, partner sitting out */
  goingAlone: boolean;
  [key: string]: ConfigFieldValue;
}

export const euchreConfig = defineConfig<EuchreRules>(
  [
    {
      key: 'targetScore',
      kind: 'enum',
      label: 'Game to',
      group: 'Match',
      options: [
        { value: 5, label: '5 — quick cut' },
        { value: 10, label: '10 — standard' },
        { value: 15, label: '15 — long game' },
      ],
      default: 10,
      help: 'First partnership to reach this score wins the match.',
    },
    {
      key: 'stickDealer',
      kind: 'toggle',
      label: 'Stick the dealer',
      group: 'Bidding',
      default: true,
      help: 'In the second bidding round the dealer must call a suit when everyone else passes.',
    },
    {
      key: 'goingAlone',
      kind: 'toggle',
      label: 'Allow going alone',
      group: 'Bidding',
      default: true,
      help: 'A caller with a monster hand may send their partner to the bench for the hand.',
    },
  ],
  [
    { id: 'classic', label: 'Classic Pub', values: {} },
    { id: 'quick-cut', label: 'Quick Cut', values: { targetScore: 5 } },
    { id: 'long-game', label: 'Long Game', values: { targetScore: 15 } },
    { id: 'old-school', label: 'Old School', values: { stickDealer: false } },
  ],
);
