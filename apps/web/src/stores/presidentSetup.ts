import { applyPreset } from '@parlour/engine';
import { presidentConfig, type PresidentRules } from '@parlour/game-president';
import { create } from 'zustand';
import { getGameMode, modePreset } from '@/lib/games';
import { isPresidentModeId, type PresidentModeId } from '@/lib/president/modes';

export const PRESIDENT_SEAT_OPTIONS = [4, 5, 6, 7, 8] as const;

export type PresidentSetupState = {
  mode: PresidentModeId;
  seats: number;
  /** Per-key overrides layered on top of the selected mode's preset. */
  overrides: Partial<PresidentRules>;
  /** Takes the registry's string ids; anything unknown is ignored. */
  setMode: (mode: string) => void;
  setSeats: (seats: number) => void;
  setRule: (key: string, value: PresidentRules[string]) => void;
  resetRules: () => void;
};

function clampSeats(value: number): number {
  return (PRESIDENT_SEAT_OPTIONS as readonly number[]).includes(value) ? value : 5;
}

/** The rules a table will actually deal with: mode preset + any overrides. */
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

/**
 * President session setup — UI state only. Rule *values* still come from
 * game-president's schema; this just records which preset is selected and
 * which individual knobs the host has turned since.
 */
export const usePresidentSetupStore = create<PresidentSetupState>()((set) => ({
  mode: 'classic',
  seats: 5,
  overrides: {},
  // Switching preset drops per-knob overrides: the tile you picked is the table.
  setMode: (mode) => set(isPresidentModeId(mode) ? { mode, overrides: {} } : {}),
  setSeats: (seats) => set({ seats: clampSeats(seats) }),
  setRule: (key, value) =>
    set((state) => ({
      overrides: { ...state.overrides, [key]: value } as Partial<PresidentRules>,
    })),
  resetRules: () => set({ overrides: {} }),
}));
