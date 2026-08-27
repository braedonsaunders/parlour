import { isScopaModeId, type ScopaModeId } from '@/lib/scopa/modes';
import { defineSetup } from '@/stores/gameSetup';
import { clampBotTier, type BotTier } from '@/stores/setup';

export const SCOPA_SETUP_STORAGE_KEY = 'parlour.scopa.setup.v1';

export const SCOPA_SEAT_OPTIONS = [2, 3, 4, 6] as const;

export type ScopaSetupState = {
  mode: ScopaModeId;
  botTier: BotTier;
  seats: number;
  setMode: (mode: ScopaModeId) => void;
  setBotTier: (tier: number) => void;
  setSeats: (seats: number) => void;
};

export function clampScopaSeats(seats: number, mode: ScopaModeId = 'classic'): number {
  if (mode === 'scopone') return 4;
  return SCOPA_SEAT_OPTIONS.includes(seats as never) ? seats : 4;
}

/**
 * Defined against the primitive rather than `defineSeatedSetup`, because Scopa's
 * seat count is not independent of its mode: scopone is four-handed whatever
 * the picker last said. A shared seated factory would have to grow a hook for
 * one game, which is how a factory starts lying about the others.
 */
export const useScopaSetupStore = defineSetup<
  { mode: ScopaModeId; botTier: BotTier; seats: number },
  Pick<ScopaSetupState, 'setMode' | 'setBotTier' | 'setSeats'>
>(
  'scopa',
  {
    defaults: { mode: 'classic', botTier: 2, seats: 4 },
    coerce: (stored) => {
      const mode = isScopaModeId(stored.mode) ? stored.mode : 'classic';
      return {
        mode,
        seats: clampScopaSeats(Number(stored.seats), mode),
        botTier: clampBotTier(Number(stored.botTier)),
      };
    },
  },
  (setup) => ({
    setMode: (mode) => setup.patch({ mode, seats: clampScopaSeats(setup.get().seats, mode) }),
    setBotTier: (tier) => setup.patch({ botTier: clampBotTier(tier) }),
    setSeats: (seats) => setup.patch({ seats: clampScopaSeats(seats, setup.get().mode) }),
  }),
);
