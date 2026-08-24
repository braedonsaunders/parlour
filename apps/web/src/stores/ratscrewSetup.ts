import { applyPreset } from '@parlour/engine';
import {
  ratscrewConfigSchema,
  type RatscrewConfig,
} from '@parlour/game-ratscrew';
import { create } from 'zustand';
import type { RatscrewModeId } from '@/lib/ratscrew/modes';
import type { SeatCount } from '@/stores/setup';

export type RatscrewSetupState = {
  mode: RatscrewModeId;
  seats: SeatCount;
  /** Per-key overrides layered on top of the selected mode's preset. */
  overrides: Partial<RatscrewConfig>;
  setMode: (mode: RatscrewModeId) => void;
  setSeats: (seats: number) => void;
  setRule: (key: string, value: RatscrewConfig[string]) => void;
  resetRules: () => void;
};

function clampSeats(value: number): SeatCount {
  if (value === 2 || value === 3 || value === 4) return value;
  return 4;
}

/** The rules a table will actually deal with: mode preset + any overrides. */
export function ratscrewRulesFor(
  mode: RatscrewModeId,
  overrides: Partial<RatscrewConfig>,
): RatscrewConfig {
  return ratscrewConfigSchema.resolve({ ...applyPreset(ratscrewConfigSchema, mode), ...overrides });
}

/**
 * Rat Screw session setup — UI state only. Rule *values* still come from
 * game-ratscrew's schema; this just records which preset is selected and which
 * individual knobs the host has turned since.
 */
export const useRatscrewSetupStore = create<RatscrewSetupState>()((set) => ({
  mode: 'classic',
  seats: 4,
  overrides: {},
  // Switching preset drops per-knob overrides: the tile you picked is the table.
  setMode: (mode) => set({ mode, overrides: {} }),
  setSeats: (seats) => set({ seats: clampSeats(seats) }),
  setRule: (key, value) =>
    set((state) => ({
      overrides: { ...state.overrides, [key]: value } as Partial<RatscrewConfig>,
    })),
  resetRules: () => set({ overrides: {} }),
}));
