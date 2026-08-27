import { applyPreset } from '@parlour/engine';
import { wildpileConfig, type WildpileRules } from '@parlour/game-wildpile';
import { getGameMode, modePreset } from '@/lib/games';
import { isWildModeId, type WildModeId } from '@/lib/wild/modes';
import type { SeatCount } from '@/stores/setup';
import { defineSeatedRulesSetup, type SeatedRulesSetup } from './setupFactories';

export const WILD_SETUP_STORAGE_KEY = 'parlour.wild.setup.v1';

export type WildSetupState = SeatedRulesSetup<WildModeId, WildpileRules, SeatCount>;

function clampSeats(value: number): SeatCount {
  if (value === 2 || value === 3 || value === 4) return value;
  return 4;
}

/** The rules a table will actually deal with: mode preset + any overrides. */
export function wildRulesFor(mode: WildModeId, overrides: Partial<WildpileRules>): WildpileRules {
  // The mode names its own preset in the pack's catalog; a mode that names
  // none simply starts from the schema defaults.
  const preset = modePreset(getGameMode('wild', mode));
  const base = preset ? applyPreset(wildpileConfig, preset) : wildpileConfig.defaults();
  return wildpileConfig.resolve({ ...base, ...overrides });
}

/**
 * Wild session setup — UI state only. Rule *values* still come from
 * game-wildpile's schema; this just records which preset is selected and which
 * individual knobs the host has turned since.
 */
export const useWildSetupStore = defineSeatedRulesSetup<WildModeId, WildpileRules, SeatCount>({
  gameId: 'wild',
  defaultMode: 'party',
  isMode: isWildModeId,
  defaultSeats: 4,
  clampSeats,
});
