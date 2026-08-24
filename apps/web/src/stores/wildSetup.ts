import { applyPreset } from '@parlour/engine';
import { wildpileConfig, type WildpileRules } from '@parlour/game-wildpile';
import { create } from 'zustand';
import type { WildModeId } from '@/lib/wild/modes';
import type { SeatCount } from '@/stores/setup';

export type WildSetupState = {
  mode: WildModeId;
  seats: SeatCount;
  /** Per-key overrides layered on top of the selected mode's preset. */
  overrides: Partial<WildpileRules>;
  setMode: (mode: WildModeId) => void;
  setSeats: (seats: number) => void;
  setRule: (key: string, value: WildpileRules[string]) => void;
  resetRules: () => void;
};

function clampSeats(value: number): SeatCount {
  if (value === 2 || value === 3 || value === 4) return value;
  return 4;
}

/** The rules a table will actually deal with: mode preset + any overrides. */
export function wildRulesFor(mode: WildModeId, overrides: Partial<WildpileRules>): WildpileRules {
  return wildpileConfig.resolve({ ...applyPreset(wildpileConfig, mode), ...overrides });
}

/**
 * Wild session setup — UI state only. Rule *values* still come from
 * game-wildpile's schema; this just records which preset is selected and which
 * individual knobs the host has turned since.
 */
export const useWildSetupStore = create<WildSetupState>()((set) => ({
  mode: 'party',
  seats: 4,
  overrides: {},
  // Switching preset drops per-knob overrides: the tile you picked is the table.
  setMode: (mode) => set({ mode, overrides: {} }),
  setSeats: (seats) => set({ seats: clampSeats(seats) }),
  setRule: (key, value) =>
    set((state) => ({ overrides: { ...state.overrides, [key]: value } as Partial<WildpileRules> })),
  resetRules: () => set({ overrides: {} }),
}));
