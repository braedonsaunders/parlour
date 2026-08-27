import type { GameMode } from '@parlour/engine';
import type { PalaceRules } from '@parlour/game-palace';
import { gameModes, isGameModeId } from '@/lib/games';

export type PalaceModeId = 'classic' | 'quick' | 'chaos';

export type PalaceModeDef = GameMode;

/**
 * Palace's table settings, straight from the pack's shelf entry. Rule values
 * live in @parlour/game-palace's config schema and the presentation lives
 * beside them in its catalog; this module is only the app-side name for it.
 */
export const PALACE_MODES: readonly PalaceModeDef[] = gameModes('palace');

/** A comfortable race to the target; the tense-music cue measures against this. */
export const PALACE_MATCH_PACE_MS = 480_000;

const BY_ID = new Map(PALACE_MODES.map((mode) => [mode.id, mode]));

export function getPalaceMode(id: PalaceModeId): PalaceModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown palace mode id: ${id}`);
  return mode;
}

export function isPalaceModeId(value: unknown): value is PalaceModeId {
  return isGameModeId('palace', value);
}

/**
 * Best-fit mode label for a set of rules that arrived over the wire. Tables
 * can be tuned knob by knob, so this is presentation only — never a rules
 * source.
 */
export function palaceModeForRules(rules: PalaceRules): PalaceModeId {
  if (rules.winsTo <= 1) return 'quick';
  if (!rules.allowSwap) return 'chaos';
  return 'classic';
}
