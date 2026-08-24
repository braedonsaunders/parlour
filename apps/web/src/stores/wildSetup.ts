import { applyPreset } from '@parlour/engine';
import { wildpileConfig, type WildpileRules } from '@parlour/game-wildpile';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getGameMode, modePreset } from '@/lib/games';
import { isWildModeId, type WildModeId } from '@/lib/wild/modes';
import { clampBotTier, type BotTier, type SeatCount } from '@/stores/setup';
import { setupPersistence, storedOverrides } from '@/stores/setupPersistence';

export const WILD_SETUP_STORAGE_KEY = 'parlour.wild.setup.v1';

export type WildSetupState = {
  mode: WildModeId;
  seats: SeatCount;
  botTier: BotTier;
  /** Per-key overrides layered on top of the selected mode's preset. */
  overrides: Partial<WildpileRules>;
  /** Takes the registry's string ids; anything unknown is ignored. */
  setMode: (mode: string) => void;
  setSeats: (seats: number) => void;
  setBotTier: (tier: number) => void;
  setRule: (key: string, value: WildpileRules[string]) => void;
  resetRules: () => void;
};

function clampSeats(value: number): SeatCount {
  if (value === 2 || value === 3 || value === 4) return value;
  return 4;
}

/** The rules a table will actually deal with: mode preset + any overrides. */
export function wildRulesFor(mode: WildModeId, overrides: Partial<WildpileRules>): WildpileRules {
  // The mode names its own preset in the pack's catalog; a mode that names
  // none simply starts from the schema defaults.
  const preset = modePreset(getGameMode('wild', mode));
  const base = preset ? applyPreset(wildpileConfig, preset) : wildpileConfig.defaults();
  return wildpileConfig.resolve({ ...base, ...overrides });
}

/**
 * Wild session setup — UI state only. Rule *values* still come from
 * game-wildpile's schema; this just records which preset is selected and which
 * individual knobs the host has turned since.
 */
export const useWildSetupStore = create<WildSetupState>()(
  persist(
    (set) => ({
      mode: 'party',
      seats: 4,
      botTier: 2,
      overrides: {},
      // Switching preset drops per-knob overrides: the tile you picked is the table.
      setMode: (mode) => set(isWildModeId(mode) ? { mode, overrides: {} } : {}),
      setSeats: (seats) => set({ seats: clampSeats(seats) }),
      setBotTier: (tier) => set({ botTier: clampBotTier(tier) }),
      setRule: (key, value) =>
        set((state) => ({
          overrides: { ...state.overrides, [key]: value } as Partial<WildpileRules>,
        })),
      resetRules: () => set({ overrides: {} }),
    }),
    setupPersistence<WildSetupState>(WILD_SETUP_STORAGE_KEY, (stored) => ({
      mode: isWildModeId(stored.mode) ? stored.mode : 'party',
      seats: clampSeats(Number(stored.seats)),
      botTier: clampBotTier(Number(stored.botTier)),
      overrides: storedOverrides<WildpileRules>(stored.overrides),
    })),
  ),
);
