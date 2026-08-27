import { applyPreset } from '@parlour/engine';
import { ratscrewConfigSchema, type RatscrewConfig } from '@parlour/game-ratscrew';
import { getGameMode, modePreset } from '@/lib/games';
import { isRatscrewModeId, type RatscrewModeId } from '@/lib/ratscrew/modes';
import { defineSetup } from '@/stores/gameSetup';
import { clampBotTier, type BotTier, type SeatCount } from '@/stores/setup';
import { storedOverrides } from '@/stores/setupPersistence';

export const RATSCREW_SETUP_STORAGE_KEY = 'parlour.ratscrew.setup.v1';

export type RatscrewSetupState = {
  mode: RatscrewModeId;
  seats: SeatCount;
  botTier: BotTier;
  /** Per-key overrides layered on top of the selected mode's preset. */
  overrides: Partial<RatscrewConfig>;
  /** Takes the registry's string ids; anything unknown is ignored. */
  setMode: (mode: string) => void;
  setSeats: (seats: number) => void;
  setBotTier: (tier: number) => void;
  setRule: (key: string, value: RatscrewConfig[string]) => void;
  resetRules: () => void;
};

function clampSeats(value: number): SeatCount {
  if (value === 2 || value === 3 || value === 4) return value;
  return 4;
}

export function ratscrewRulesFor(
  mode: RatscrewModeId,
  overrides: Partial<RatscrewConfig>,
): RatscrewConfig {
  // The mode names its own preset in the pack's catalog; a mode that names
  // none simply starts from the schema defaults.
  const preset = modePreset(getGameMode('ratscrew', mode));
  const base = preset ? applyPreset(ratscrewConfigSchema, preset) : ratscrewConfigSchema.defaults();
  return ratscrewConfigSchema.resolve({ ...base, ...overrides });
}

/**
 * Defined against the primitive rather than `defineSeatedRulesSetup` for one
 * reason: Rat Screw's `setMode` FALLS BACK to classic for an id it does not
 * know, where every other game ignores the call and keeps the mode it had.
 * That is a real difference in what a player sees, so it is preserved rather
 * than smoothed over — and written down here so the next person can decide
 * whether it was ever intended.
 */
export const useRatscrewSetupStore = defineSetup<
  {
    mode: RatscrewModeId;
    seats: SeatCount;
    botTier: BotTier;
    overrides: Partial<RatscrewConfig>;
  },
  Pick<RatscrewSetupState, 'setMode' | 'setSeats' | 'setBotTier' | 'setRule' | 'resetRules'>
>(
  'ratscrew',
  {
    defaults: { mode: 'classic', seats: 4, botTier: 2, overrides: {} },
    coerce: (stored) => ({
      mode: isRatscrewModeId(stored.mode) ? stored.mode : 'classic',
      seats: clampSeats(Number(stored.seats)),
      botTier: clampBotTier(Number(stored.botTier)),
      overrides: storedOverrides<RatscrewConfig>(stored.overrides),
    }),
  },
  (setup) => ({
    setMode: (mode) =>
      setup.patch({ mode: isRatscrewModeId(mode) ? mode : 'classic', overrides: {} }),
    setSeats: (seats) => setup.patch({ seats: clampSeats(seats) }),
    setBotTier: (tier) => setup.patch({ botTier: clampBotTier(tier) }),
    setRule: (key, value) => setup.patch({ overrides: { ...setup.get().overrides, [key]: value } }),
    resetRules: () => setup.patch({ overrides: {} }),
  }),
);
