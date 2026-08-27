import { applyPreset } from '@parlour/engine';
import { cribbageConfigSchema, type CribbageConfig } from '@parlour/game-cribbage';
import { getGameMode, modePreset } from '@/lib/games';
import { isCribbageModeId, type CribbageModeId } from '@/lib/cribbage/modes';
import { defineRulesSetup, type RulesSetup } from './setupFactories';

export const CRIBBAGE_SETUP_STORAGE_KEY = 'parlour.cribbage.setup.v1';

export type CribbageBotTier = 1 | 2 | 3;

export type CribbageSetupState = RulesSetup<CribbageModeId, CribbageConfig>;

export function cribbageRulesFor(
  mode: CribbageModeId,
  overrides: Partial<CribbageConfig>,
): CribbageConfig {
  const preset = modePreset(getGameMode('cribbage', mode));
  const base = preset ? applyPreset(cribbageConfigSchema, preset) : cribbageConfigSchema.defaults();
  return cribbageConfigSchema.resolve({ ...base, ...overrides });
}

/** Cribbage session setup — UI state only; rule values come from the pack's schema. */
export const useCribbageSetupStore = defineRulesSetup<CribbageModeId, CribbageConfig>({
  gameId: 'cribbage',
  defaultMode: 'classic-pub',
  isMode: isCribbageModeId,
});
