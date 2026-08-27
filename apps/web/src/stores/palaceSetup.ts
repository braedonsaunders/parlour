import { applyPreset } from '@parlour/engine';
import { palaceConfig, type PalaceRules } from '@parlour/game-palace';
import { getGameMode, modePreset } from '@/lib/games';
import { isPalaceModeId, type PalaceModeId } from '@/lib/palace/modes';
import { defineSeatedRulesSetup, type SeatedRulesSetup } from './setupFactories';

export const PALACE_SETUP_STORAGE_KEY = 'parlour.palace.setup.v1';

export const PALACE_SEAT_OPTIONS = [2, 3, 4, 5, 6] as const;

export type PalaceSetupState = SeatedRulesSetup<PalaceModeId, PalaceRules>;

function clampSeats(value: number): number {
  return (PALACE_SEAT_OPTIONS as readonly number[]).includes(value) ? value : 4;
}

export function palaceRulesFor(mode: PalaceModeId, overrides: Partial<PalaceRules>): PalaceRules {
  const preset = modePreset(getGameMode('palace', mode));
  const base = preset ? applyPreset(palaceConfig, preset) : palaceConfig.defaults();
  return palaceConfig.resolve({ ...base, ...overrides });
}

/**
 * Palace session setup — UI state only. Rule *values* come from
 * game-palace's schema; this records which preset is selected and which
 * knobs the host has turned since.
 */
export const usePalaceSetupStore = defineSeatedRulesSetup<PalaceModeId, PalaceRules>({
  gameId: 'palace',
  defaultMode: 'classic',
  isMode: isPalaceModeId,
  defaultSeats: 4,
  clampSeats,
});
