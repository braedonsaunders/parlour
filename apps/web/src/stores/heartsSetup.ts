import { applyPreset } from '@parlour/engine';
import {
  heartsConfigSchema,
  type HeartsRules,
} from '@parlour/game-hearts';
import { create } from 'zustand';
import { getGameMode, modePreset } from '@/lib/games';
import { isHeartsModeId, type HeartsModeId } from '@/lib/hearts/modes';

export type HeartsSetupState = {
  mode: HeartsModeId;
  /** Per-key overrides layered on top of the selected mode's preset. */
  overrides: Partial<HeartsRules>;
  /** Takes the registry's string ids; anything unknown is ignored. */
  setMode: (mode: string) => void;
  setRule: (key: string, value: HeartsRules[string]) => void;
  resetRules: () => void;
};

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
export const useHeartsSetupStore = create<HeartsSetupState>()((set) => ({
  mode: 'classic',
  overrides: {},
  // Switching preset drops per-knob overrides: the tile you picked is the table.
  setMode: (mode) => set(isHeartsModeId(mode) ? { mode, overrides: {} } : {}),
  setRule: (key, value) =>
    set((state) => ({ overrides: { ...state.overrides, [key]: value } as Partial<HeartsRules> })),
  resetRules: () => set({ overrides: {} }),
}));
