import type { GameMode } from '@parlour/engine';
import type { CribbageConfig } from '@parlour/game-cribbage';
import { gameModes, isGameModeId } from '@/lib/games';

export type CribbageModeId = 'classic-pub' | 'cutthroat' | 'match-play';
export type CribbageModeDef = GameMode;

export const CRIBBAGE_MODES: readonly CribbageModeDef[] = gameModes('cribbage');

const BY_ID = new Map(CRIBBAGE_MODES.map((mode) => [mode.id, mode]));

export function getCribbageMode(id: CribbageModeId): CribbageModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown cribbage mode id: ${id}`);
  return mode;
}

export function isCribbageModeId(value: unknown): value is CribbageModeId {
  return isGameModeId('cribbage', value);
}

/** Presentation label for authoritative rules received from a friend room. */
export function cribbageModeForRules(rules: CribbageConfig): CribbageModeId {
  if (rules.gamesToWin > 1) return 'match-play';
  return rules.muggins ? 'cutthroat' : 'classic-pub';
}
