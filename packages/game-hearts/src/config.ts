import { defineConfig, type ConfigFieldValue } from '@parlour/engine';

/**
 * Hearts house rules. Fixed rules (pass three, rotating direction, 2♣ leads,
 * must follow suit, Q♠ = 13, hearts = 1, lowest total wins) are not toggles —
 * the schema only exposes the knobs a table may legitimately flip.
 */
export interface HeartsRules {
  /** which way cards pass this hand; matches inject the rotation per round */
  passDirection: PassDirection;
  /** include the no-pass hold hand every fourth deal of a match */
  holdHand: boolean;
  /** ban penalty cards on the first trick */
  noPointsFirstTrick: boolean;
  /** J♦ scores −10 to whoever takes it */
  jackDiamonds: boolean;
  /** cumulative score that ends the match; lowest total wins */
  gameOver: number;
  /** shooting the moon: +26 to every opponent, or −26 off your own total */
  moonShift: 'opponents' | 'self';
  [key: string]: ConfigFieldValue;
}

export type PassDirection = 'left' | 'right' | 'across' | 'hold';

export const PASS_ROTATION_WITH_HOLD = ['left', 'right', 'across', 'hold'] as const;
export const PASS_ROTATION_PLAIN = ['left', 'right', 'across'] as const;

/** Deal N of a match passes this way. Hand 1 is left, then right, across, hold. */
export function passDirectionFor(handIndex: number, holdHand: boolean): PassDirection {
  const rotation = holdHand ? PASS_ROTATION_WITH_HOLD : PASS_ROTATION_PLAIN;
  return rotation[((handIndex % rotation.length) + rotation.length) % rotation.length] as PassDirection;
}

/** Seat offset each direction sends cards by (clockwise seat numbering). */
export function passOffset(direction: PassDirection): number {
  switch (direction) {
    case 'left':
      return 1;
    case 'right':
      return -1;
    case 'across':
      return 2;
    case 'hold':
      return 0;
  }
}

export const HEARTS_GAME_OVER_OPTIONS = [50, 75, 100] as const;

export const heartsConfigSchema = defineConfig<HeartsRules>(
  [
    {
      key: 'passDirection',
      kind: 'enum',
      label: 'Passing',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' },
        { value: 'across', label: 'Across' },
        { value: 'hold', label: 'Hold (no pass)' },
      ],
      default: 'left',
    },
    {
      key: 'holdHand',
      kind: 'toggle',
      label: 'Hold hand every fourth deal',
      default: true,
    },
    {
      key: 'noPointsFirstTrick',
      kind: 'toggle',
      label: 'No penalty cards on the first trick',
      default: true,
    },
    {
      key: 'jackDiamonds',
      kind: 'toggle',
      label: 'Jack of diamonds scores −10',
      default: false,
    },
    {
      key: 'gameOver',
      kind: 'enum',
      label: 'Game ends at',
      options: [
        { value: 50, label: '50 points' },
        { value: 75, label: '75 points' },
        { value: 100, label: '100 points' },
      ],
      default: 100,
    },
    {
      key: 'moonShift',
      kind: 'enum',
      label: 'Shooting the moon',
      options: [
        { value: 'opponents', label: '+26 to everyone else' },
        { value: 'self', label: '−26 from your own score' },
      ],
      default: 'opponents',
    },
  ],
  [
    { id: 'classic', label: 'Classic Hearts', values: {} },
    { id: 'quickcut', label: 'Quick Cut', values: { gameOver: 50 } },
    {
      id: 'cutthroat',
      label: 'Cutthroat',
      values: { jackDiamonds: true, noPointsFirstTrick: false },
    },
  ],
);

export function isPassDirection(value: unknown): value is PassDirection {
  return value === 'left' || value === 'right' || value === 'across' || value === 'hold';
}
