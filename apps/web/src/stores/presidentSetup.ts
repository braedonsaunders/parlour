import { applyPreset } from '@parlour/engine';
import { presidentConfig, type PresidentRules } from '@parlour/game-president';
import { getGameMode, modePreset } from '@/lib/games';
import { isPresidentModeId, type PresidentModeId } from '@/lib/president/modes';
import { defineSeatedRulesSetup, type SeatedRulesSetup } from './setupFactories';

export const PRESIDENT_SEAT_OPTIONS = [4, 5, 6, 7, 8] as const;

export const PRESIDENT_SETUP_STORAGE_KEY = 'parlour.president.setup.v1';

export type PresidentSetupState = SeatedRulesSetup<PresidentModeId, PresidentRules>;

function clampSeats(value: number): number {
  return (PRESIDENT_SEAT_OPTIONS as readonly number[]).includes(value) ? value : 5;
}

export function presidentRulesFor(
  mode: PresidentModeId,
  overrides: Partial<PresidentRules>,
): PresidentRules {
  // The mode names its own preset in the pack's catalog; a mode that names
  // none simply starts from the schema defaults.
  const preset = modePreset(getGameMode('president', mode));
  const base = preset ? applyPreset(presidentConfig, preset) : presidentConfig.defaults();
  return presidentConfig.resolve({ ...base, ...overrides });
}

/** President session setup — UI state only; rule values come from the pack's schema. */
export const usePresidentSetupStore = defineSeatedRulesSetup<PresidentModeId, PresidentRules>({
  gameId: 'president',
  defaultMode: 'classic',
  isMode: isPresidentModeId,
  defaultSeats: 5,
  clampSeats,
});
