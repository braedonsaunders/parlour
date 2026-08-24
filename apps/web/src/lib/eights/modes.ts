import type { GameMode } from '@parlour/engine';
import type { EightsRules } from '@parlour/game-eights';
import { gameModes, isGameModeId } from '@/lib/games';

export type EightsModeId = 'classic' | 'house' | 'chaos';

export type EightsModeDef = GameMode;

/**
 * Crazy Eights' table settings, straight from the pack's shelf entry. Rule
 * values live in @parlour/game-eights' config schema and the presentation lives
 * beside them in its catalog; this module is only the app-side name for it.
 */
export const EIGHTS_MODES: readonly EightsModeDef[] = gameModes('eights');

/** A comfortable race to the target; the tense-music cue measures against this. */
export const EIGHTS_MATCH_PACE_MS = 600_000;

const BY_ID = new Map(EIGHTS_MODES.map((mode) => [mode.id, mode]));

export function getEightsMode(id: EightsModeId): EightsModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown eights mode id: ${id}`);
  return mode;
}

export function isEightsModeId(value: unknown): value is EightsModeId {
  return isGameModeId('eights', value);
}

/**
 * Best-fit mode label for a set of rules that arrived over the wire. Tables can
 * be tuned knob by knob, so this is presentation only — never a rules source.
 */
export function eightsModeForRules(rules: EightsRules): EightsModeId {
  if (rules.stackDrawTwo || rules.forcePlay) return 'chaos';
  if (rules.twosDrawTwo || rules.queensSkip || rules.acesReverse) return 'house';
  return 'classic';
}
