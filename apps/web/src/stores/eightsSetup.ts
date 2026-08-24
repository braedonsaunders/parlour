import { applyPreset } from '@parlour/engine';
import { eightsConfig, type EightsRules } from '@parlour/game-eights';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getGameMode, modePreset } from '@/lib/games';
import { isEightsModeId, type EightsModeId } from '@/lib/eights/modes';
import { clampBotTier, type BotTier } from '@/stores/setup';
import { setupPersistence, storedOverrides } from '@/stores/setupPersistence';

export const EIGHTS_SEAT_OPTIONS = [2, 3, 4, 5, 6] as const;

export const EIGHTS_SETUP_STORAGE_KEY = 'parlour.eights.setup.v1';

export type EightsSetupState = {
  mode: EightsModeId;
  seats: number;
  botTier: BotTier;
  /** Per-key overrides layered on top of the selected mode's preset. */
  overrides: Partial<EightsRules>;
  /** Takes the registry's string ids; anything unknown is ignored. */
  setMode: (mode: string) => void;
  setSeats: (seats: number) => void;
  setBotTier: (tier: number) => void;
  setRule: (key: string, value: EightsRules[string]) => void;
  resetRules: () => void;
};

function clampSeats(value: number): number {
  return (EIGHTS_SEAT_OPTIONS as readonly number[]).includes(value) ? value : 4;
}

/** The rules a table will actually deal with: mode preset + any overrides. */
export function eightsRulesFor(mode: EightsModeId, overrides: Partial<EightsRules>): EightsRules {
  const preset = modePreset(getGameMode('eights', mode));
  const base = preset ? applyPreset(eightsConfig, preset) : eightsConfig.defaults();
  return eightsConfig.resolve({ ...base, ...overrides });
}

/**
 * Crazy Eights session setup — UI state only. Rule *values* come from
 * game-eights' schema; this records which preset is selected and which
 * individual knobs the host has turned since.
 */
export const useEightsSetupStore = create<EightsSetupState>()(
  persist(
    (set) => ({
      mode: 'house',
      seats: 4,
      botTier: 2,
      overrides: {},
      // Switching preset drops per-knob overrides: the tile you picked is the table.
      setMode: (mode) => set(isEightsModeId(mode) ? { mode, overrides: {} } : {}),
      setSeats: (seats) => set({ seats: clampSeats(seats) }),
      setBotTier: (tier) => set({ botTier: clampBotTier(tier) }),
      setRule: (key, value) =>
        set((state) => ({
          overrides: { ...state.overrides, [key]: value } as Partial<EightsRules>,
        })),
      resetRules: () => set({ overrides: {} }),
    }),
    setupPersistence<EightsSetupState>(EIGHTS_SETUP_STORAGE_KEY, (stored) => ({
      mode: isEightsModeId(stored.mode) ? stored.mode : 'house',
      seats: clampSeats(Number(stored.seats)),
      botTier: clampBotTier(Number(stored.botTier)),
      overrides: storedOverrides<EightsRules>(stored.overrides),
    })),
  ),
);
