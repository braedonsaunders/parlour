import type { GameMode } from '@parlour/engine';
import type { PresidentRules } from '@parlour/game-president';
import { gameModes, isGameModeId } from '@/lib/games';

export type PresidentModeId = 'classic' | 'rapid' | 'marathon';

export type PresidentModeDef = GameMode;

/**
 * President's table settings, straight from the pack's shelf entry. Rule
 * values live in @parlour/game-president's config schema and the presentation
 * lives beside them in its catalog; this module is only the app-side name for
 * that list.
 */
export const PRESIDENT_MODES: readonly PresidentModeDef[] = gameModes('president');

/** A comfortable full-table match; the tense-music cue measures against this. */
export const PRESIDENT_MATCH_PACE_MS = 900_000;

const BY_ID = new Map(PRESIDENT_MODES.map((mode) => [mode.id, mode]));

export function getPresidentMode(id: PresidentModeId): PresidentModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown president mode id: ${id}`);
  return mode;
}

export function isPresidentModeId(value: unknown): value is PresidentModeId {
  return isGameModeId('president', value);
}

/**
 * Best-fit mode label for a set of rules that arrived over the wire. Tables
 * can be tuned knob by knob, so this is presentation only — never a rules
 * source.
 */
export function presidentModeForRules(rules: PresidentRules): PresidentModeId {
  if (rules.targetPoints <= 7) return 'rapid';
  if (rules.targetPoints >= 21) return 'marathon';
  return 'classic';
}
