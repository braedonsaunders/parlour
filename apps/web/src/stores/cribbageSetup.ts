import { applyPreset } from '@parlour/engine';
import { cribbageConfigSchema, type CribbageConfig } from '@parlour/game-cribbage';
import { create } from 'zustand';
import { getGameMode, modePreset } from '@/lib/games';
import { isCribbageModeId, type CribbageModeId } from '@/lib/cribbage/modes';

export type CribbageBotTier = 1 | 2 | 3;

export type CribbageSetupState = {
  mode: CribbageModeId;
  botTier: CribbageBotTier;
  overrides: Partial<CribbageConfig>;
  setMode: (mode: string) => void;
  setBotTier: (tier: number) => void;
  setRule: (key: string, value: CribbageConfig[string]) => void;
  resetRules: () => void;
};

export function cribbageRulesFor(
  mode: CribbageModeId,
  overrides: Partial<CribbageConfig>,
): CribbageConfig {
  const preset = modePreset(getGameMode('cribbage', mode));
  const base = preset ? applyPreset(cribbageConfigSchema, preset) : cribbageConfigSchema.defaults();
  return cribbageConfigSchema.resolve({ ...base, ...overrides });
}

export const useCribbageSetupStore = create<CribbageSetupState>()((set) => ({
  mode: 'classic-pub',
  botTier: 2,
  overrides: {},
  setMode: (mode) => set(isCribbageModeId(mode) ? { mode, overrides: {} } : {}),
  setBotTier: (tier) => set({ botTier: tier === 1 || tier === 3 ? tier : 2 }),
  setRule: (key, value) =>
    set((state) => ({
      overrides: { ...state.overrides, [key]: value } as Partial<CribbageConfig>,
    })),
  resetRules: () => set({ overrides: {} }),
}));
