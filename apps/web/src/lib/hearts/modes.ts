import type { GameMode } from '@/lib/games';
import { gameModes } from '@/lib/games';
import type { HeartsRules } from '@parlour/game-hearts';

/** The registry's Hearts modes, in pack order (classic · quickcut · cutthroat). */
export const HEARTS_MODES: readonly GameMode[] = gameModes('hearts');

export type HeartsModeId = 'classic' | 'quickcut' | 'cutthroat';

const BY_ID = new Map(HEARTS_MODES.map((mode) => [mode.id, mode]));

/** One hand of hearts runs about four minutes; the tense cue rides this pace. */
export const HEARTS_HAND_PACE_MS = 240_000;

export function isHeartsModeId(value: unknown): value is HeartsModeId {
  return typeof value === 'string' && BY_ID.has(value);
}

export function heartsModeForRules(rules: HeartsRules): HeartsModeId {
  if (rules.jackDiamonds && !rules.noPointsFirstTrick) return 'cutthroat';
  return rules.gameOver === 50 ? 'quickcut' : 'classic';
}
