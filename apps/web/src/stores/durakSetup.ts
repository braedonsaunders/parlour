import { applyPreset } from '@parlour/engine';
import { durakConfig, type DurakRules } from '@parlour/game-durak';
import { getGameMode, modePreset } from '@/lib/games';
import { isDurakModeId, type DurakModeId } from '@/lib/durak/modes';
import { defineSeatedRulesSetup, type SeatedRulesSetup } from './setupFactories';

export const DURAK_SETUP_STORAGE_KEY = 'parlour.durak.setup.v1';

export const DURAK_SEAT_OPTIONS = [2, 3, 4, 5, 6] as const;

export type DurakSetupState = SeatedRulesSetup<DurakModeId, DurakRules>;

function clampSeats(value: number): number {
  return (DURAK_SEAT_OPTIONS as readonly number[]).includes(value) ? value : 4;
}

export function durakRulesFor(mode: DurakModeId, overrides: Partial<DurakRules>): DurakRules {
  const preset = modePreset(getGameMode('durak', mode));
  const base = preset ? applyPreset(durakConfig, preset) : durakConfig.defaults();
  return durakConfig.resolve({ ...base, ...overrides });
}

/**
 * Durak session setup — UI state only. Rule *values* come from game-durak's
 * schema; this records which preset is selected and which knobs the host has
 * turned since.
 */
export const useDurakSetupStore = defineSeatedRulesSetup<DurakModeId, DurakRules>({
  gameId: 'durak',
  defaultMode: 'classic',
  isMode: isDurakModeId,
  defaultSeats: 4,
  clampSeats,
});
