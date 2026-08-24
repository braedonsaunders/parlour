import type { GameMode } from '@parlour/engine';
import { gameModes, isGameModeId } from '@/lib/games';

export type ModeId = 'classic' | 'fast' | 'timed';

export type ModeDef = GameMode;

/**
 * Blitz's match formats, straight from the pack's shelf entry. Rule values live
 * in @parlour/game-blitz's config schema and the presentation lives beside them
 * in its catalog; this module is only the app-side name for that list.
 */
export const MODES: readonly ModeDef[] = gameModes('blitz');

const BY_ID = new Map(MODES.map((mode) => [mode.id, mode]));

export function getMode(id: ModeId): ModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown mode id: ${id}`);
  return mode;
}

export function isModeId(value: unknown): value is ModeId {
  return isGameModeId('blitz', value);
}
