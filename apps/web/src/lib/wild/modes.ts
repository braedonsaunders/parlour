import type { GameMode } from '@parlour/engine';
import type { WildpileRules } from '@parlour/game-wildpile';
import { gameModes, isGameModeId } from '@/lib/games';

export type WildModeId = 'classic' | 'party' | 'houseRules';

export type WildModeDef = GameMode;

/**
 * Wild's table settings, straight from the pack's shelf entry. Rule values live
 * in @parlour/game-wildpile's config schema and the presentation lives beside
 * them in its catalog; this module is only the app-side name for that list.
 */
export const WILD_MODES: readonly WildModeDef[] = gameModes('wild');

/**
 * Wild deals once and runs about five minutes. There is no match clock, so this
 * is the pace the tense music cue measures its final minute against.
 */
export const WILD_MATCH_PACE_MS = 300_000;

const BY_ID = new Map(WILD_MODES.map((mode) => [mode.id, mode]));

export function getWildMode(id: WildModeId): WildModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown wild mode id: ${id}`);
  return mode;
}

export function isWildModeId(value: unknown): value is WildModeId {
  return isGameModeId('wild', value);
}

/**
 * Best-fit mode label for a set of rules that arrived over the wire. Tables can
 * be tuned knob by knob, so this is presentation only — never a rules source.
 */
export function wildModeForRules(rules: WildpileRules): WildModeId {
  if (rules.sevenZero || rules.swapCards || rules.drawToMatch || rules.forcePlay) {
    return 'houseRules';
  }
  return rules.stackDrawTwo || rules.stackDrawFour || rules.jumpIn ? 'party' : 'classic';
}
