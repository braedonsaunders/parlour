import { applyPreset } from '@parlour/engine';
import { eightsConfig, type EightsRules } from '@parlour/game-eights';
import { getGameMode, modePreset } from '@/lib/games';
import { isEightsModeId, type EightsModeId } from '@/lib/eights/modes';
import { defineSeatedRulesSetup, type SeatedRulesSetup } from './setupFactories';

export const EIGHTS_SETUP_STORAGE_KEY = 'parlour.eights.setup.v1';

export const EIGHTS_SEAT_OPTIONS = [2, 3, 4, 5, 6] as const;

export type EightsSetupState = SeatedRulesSetup<EightsModeId, EightsRules>;

function clampSeats(value: number): number {
  return (EIGHTS_SEAT_OPTIONS as readonly number[]).includes(value) ? value : 4;
}

export function eightsRulesFor(mode: EightsModeId, overrides: Partial<EightsRules>): EightsRules {
  const preset = modePreset(getGameMode('eights', mode));
  const base = preset ? applyPreset(eightsConfig, preset) : eightsConfig.defaults();
  return eightsConfig.resolve({ ...base, ...overrides });
}

/**
 * Crazy Eights session setup — UI state only. Rule *values* come from
 * game-eights' schema; this records which preset is selected and which knobs
 * the host has turned since.
 */
export const useEightsSetupStore = defineSeatedRulesSetup<EightsModeId, EightsRules>({
  gameId: 'eights',
  defaultMode: 'house',
  isMode: isEightsModeId,
  defaultSeats: 4,
  clampSeats,
});
