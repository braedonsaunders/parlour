import { defineConfig, type ConfigFieldValue } from '@parlour/engine';

/**
 * Hold'em house rules.
 *
 * A parlour match has to end, so this is a sit-and-go: everyone starts level,
 * the blinds climb on a schedule, and the last stack standing wins. Nothing
 * here is a stake — chips are scorekeeping, per the build spec's no-real-money
 * non-goal.
 */
export interface PokerRules {
  /** chips every seat starts the match with */
  startingStack: 1500 | 3000 | 6000;
  /** how quickly the blinds climb — hands per level */
  blindSpeed: 'slow' | 'standard' | 'turbo';
  /** from level three, the big blind posts an extra blind as a table ante */
  ante: boolean;
  /** losing hands are turned over at showdown instead of mucked */
  showMucked: boolean;
  [key: string]: ConfigFieldValue;
}

export interface BlindLevel {
  small: number;
  big: number;
}

/**
 * The blind ladder. A match that reaches the top stays there — by then one
 * stack is almost always all of them.
 */
export const BLIND_LEVELS: readonly BlindLevel[] = [
  { small: 10, big: 20 },
  { small: 15, big: 30 },
  { small: 25, big: 50 },
  { small: 50, big: 100 },
  { small: 75, big: 150 },
  { small: 100, big: 200 },
  { small: 150, big: 300 },
  { small: 250, big: 500 },
  { small: 400, big: 800 },
  { small: 600, big: 1200 },
  { small: 1000, big: 2000 },
];

/** The level at which a table ante joins the blinds, when antes are on. */
export const ANTE_FROM_LEVEL = 2;

const HANDS_PER_LEVEL: Readonly<Record<PokerRules['blindSpeed'], number>> = {
  slow: 12,
  standard: 8,
  turbo: 4,
};

export function handsPerLevel(speed: PokerRules['blindSpeed']): number {
  return HANDS_PER_LEVEL[speed];
}

export function blindsForLevel(level: number): BlindLevel {
  const clamped = Math.max(0, Math.min(level, BLIND_LEVELS.length - 1));
  return BLIND_LEVELS[clamped] as BlindLevel;
}

/** The table ante due at a level — zero unless the rule is on and the level is deep enough. */
export function anteForLevel(level: number, rules: PokerRules): number {
  if (!rules.ante || level < ANTE_FROM_LEVEL) return 0;
  return blindsForLevel(level).big;
}

export const pokerConfig = defineConfig<PokerRules>(
  [
    {
      key: 'startingStack',
      kind: 'enum',
      label: 'Starting stack',
      group: 'Match',
      options: [
        { value: 1500, label: '1,500 — short' },
        { value: 3000, label: '3,000 — standard' },
        { value: 6000, label: '6,000 — deep' },
      ],
      default: 3000,
      help: 'Chips every seat starts with. Deeper stacks mean more play after the flop before anyone is committed.',
    },
    {
      key: 'blindSpeed',
      kind: 'enum',
      label: 'Blinds climb',
      group: 'Match',
      options: [
        { value: 'slow', label: 'Slow — every 12 hands' },
        { value: 'standard', label: 'Standard — every 8 hands' },
        { value: 'turbo', label: 'Turbo — every 4 hands' },
      ],
      default: 'standard',
      help: 'The blinds go up on a schedule so a match always ends. Turbo forces the action early.',
    },
    {
      key: 'ante',
      kind: 'toggle',
      label: 'Table ante',
      group: 'Betting',
      default: true,
      help: 'From the third level the big blind posts one extra blind for the whole table, so there is always something worth taking.',
    },
    {
      key: 'showMucked',
      kind: 'toggle',
      label: 'Show losing hands',
      group: 'Showdown',
      advanced: true,
      default: false,
      help: 'Off, a beaten hand is mucked face down like it would be at a real table. On, everyone sees every hand that reached the river.',
    },
  ],
  [
    { id: 'classic', label: 'Classic', values: {} },
    { id: 'turbo', label: 'Turbo', values: { startingStack: 1500, blindSpeed: 'turbo' } },
    { id: 'deep', label: 'Deep Stack', values: { startingStack: 6000, blindSpeed: 'slow' } },
  ],
);
