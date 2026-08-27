import { applyPreset } from '@parlour/engine';
import { ginConfigSchema, type GinConfig } from '@parlour/game-gin';
import { getGameMode, modePreset } from '@/lib/games';
import { isGinModeId, type GinModeId } from '@/lib/gin/modes';
import { defineRulesSetup, type RulesSetup } from './setupFactories';

export const GIN_SETUP_STORAGE_KEY = 'parlour.gin.setup.v1';

export type GinSetupState = RulesSetup<GinModeId, GinConfig>;

/** The rules a table will actually deal with: mode preset + any overrides. */
export function ginRulesFor(mode: GinModeId, overrides: Partial<GinConfig>): GinConfig {
  const preset = modePreset(getGameMode('gin', mode));
  const base = preset ? applyPreset(ginConfigSchema, preset) : ginConfigSchema.defaults();
  return ginConfigSchema.resolve({ ...base, ...overrides });
}

/** Gin session setup — UI state only; rule values come from game-gin's schema. */
export const useGinSetupStore = defineRulesSetup<GinModeId, GinConfig>({
  gameId: 'gin',
  defaultMode: 'classic',
  isMode: isGinModeId,
});
