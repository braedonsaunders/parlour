import type { GameMode } from '@parlour/engine';
import type { DurakRules } from '@parlour/game-durak';
import { gameModes, isGameModeId } from '@/lib/games';

export type DurakModeId = 'classic' | 'transfer' | 'heads-up';

export type DurakModeDef = GameMode;

/**
 * Durak's table settings, straight from the pack's shelf entry. Rule values
 * live in @parlour/game-durak's config schema and the presentation lives
 * beside them in its catalog; this module is only the app-side name for it.
 */
export const DURAK_MODES: readonly DurakModeDef[] = gameModes('durak');

/** A comfortable hand; the tense-music cue measures against this. */
export const DURAK_MATCH_PACE_MS = 480_000;

const BY_ID = new Map(DURAK_MODES.map((mode) => [mode.id, mode]));

export function getDurakMode(id: DurakModeId): DurakModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown durak mode id: ${id}`);
  return mode;
}

export function isDurakModeId(value: unknown): value is DurakModeId {
  return isGameModeId('durak', value);
}

/**
 * Best-fit mode label for a set of rules that arrived over the wire. Tables
 * can be tuned knob by knob, so this is presentation only — never a rules
 * source.
 */
export function durakModeForRules(rules: DurakRules): DurakModeId {
  if (rules.instantWin) return 'heads-up';
  if (rules.transfer) return 'transfer';
  return 'classic';
}
