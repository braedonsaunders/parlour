import { applyPreset } from '@parlour/engine';
import { heartsConfigSchema, type HeartsRules } from '@parlour/game-hearts';
import { getGameMode, modePreset } from '@/lib/games';
import { isHeartsModeId, type HeartsModeId } from '@/lib/hearts/modes';
import { defineRulesSetup, type RulesSetup } from './setupFactories';

export const HEARTS_SETUP_STORAGE_KEY = 'parlour.hearts.setup.v1';

export type HeartsSetupState = RulesSetup<HeartsModeId, HeartsRules>;

/** The rules a table will actually deal with: mode preset + any overrides. */
export function heartsRulesFor(mode: HeartsModeId, overrides: Partial<HeartsRules>): HeartsRules {
  const preset = modePreset(getGameMode('hearts', mode));
  const base = preset ? applyPreset(heartsConfigSchema, preset) : heartsConfigSchema.defaults();
  return heartsConfigSchema.resolve({ ...base, ...overrides });
}

/**
 * Hearts session setup — UI state only. Rule *values* still come from
 * game-hearts' schema; this records which preset is selected and which knobs
 * the host has turned since. Hearts seats exactly four, so there is no picker.
 */
export const useHeartsSetupStore = defineRulesSetup<HeartsModeId, HeartsRules>({
  gameId: 'hearts',
  defaultMode: 'classic',
  isMode: isHeartsModeId,
});
