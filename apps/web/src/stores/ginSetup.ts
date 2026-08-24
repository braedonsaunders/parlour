import { applyPreset } from '@parlour/engine';
import { ginConfigSchema, type GinConfig } from '@parlour/game-gin';
import { create } from 'zustand';
import { getGameMode, modePreset } from '@/lib/games';
import { isGinModeId, type GinModeId } from '@/lib/gin/modes';
import type { BotTier } from '@/stores/setup';

export type GinSetupState = {
  mode: GinModeId;
  botTier: BotTier;
  /** Per-key overrides layered on top of the selected mode's preset. */
  overrides: Partial<GinConfig>;
  setMode: (mode: string) => void;
  setBotTier: (tier: number) => void;
  setRule: (key: string, value: GinConfig[string]) => void;
  resetRules: () => void;
};

/** The rules a table will actually deal with: mode preset + any overrides. */
export function ginRulesFor(mode: GinModeId, overrides: Partial<GinConfig>): GinConfig {
  const preset = modePreset(getGameMode('gin', mode));
  const base = preset ? applyPreset(ginConfigSchema, preset) : ginConfigSchema.defaults();
  return ginConfigSchema.resolve({ ...base, ...overrides });
}

/** Gin session setup — UI state only; rule values come from game-gin's schema. */
export const useGinSetupStore = create<GinSetupState>()((set) => ({
  mode: 'classic',
  botTier: 2,
  overrides: {},
  setMode: (mode) => {
    if (isGinModeId(mode)) set({ mode, overrides: {} });
  },
  setBotTier: (tier) => {
    if (tier === 1 || tier === 2 || tier === 3) set({ botTier: tier });
  },
  setRule: (key, value) => set((state) => ({ overrides: { ...state.overrides, [key]: value } })),
  resetRules: () => set({ overrides: {} }),
}));
