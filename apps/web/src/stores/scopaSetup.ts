import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isScopaModeId, type ScopaModeId } from '@/lib/scopa/modes';
import { clampBotTier, type BotTier } from '@/stores/setup';
import { setupPersistence } from '@/stores/setupPersistence';

export const SCOPA_SETUP_STORAGE_KEY = 'parlour.scopa.setup.v1';

export type ScopaSetupState = {
  mode: ScopaModeId;
  botTier: BotTier;
  seats: number;
  setMode: (mode: ScopaModeId) => void;
  setBotTier: (tier: number) => void;
  setSeats: (seats: number) => void;
};

/** Scopone is a four-hand partnership game; the other modes seat 2, 3, 4 or 6. */
export const SCOPA_SEAT_OPTIONS = [2, 3, 4, 6] as const;

export function clampScopaSeats(seats: number, mode: ScopaModeId = 'classic'): number {
  if (mode === 'scopone') return 4;
  return SCOPA_SEAT_OPTIONS.includes(seats as never) ? seats : 4;
}

export const useScopaSetupStore = create<ScopaSetupState>()(
  persist(
    (set) => ({
      mode: 'classic',
      botTier: 2,
      seats: 4,
      setMode: (mode) => set((state) => ({ mode, seats: clampScopaSeats(state.seats, mode) })),
      setBotTier: (tier) => set({ botTier: clampBotTier(tier) }),
      setSeats: (seats) => set((state) => ({ seats: clampScopaSeats(seats, state.mode) })),
    }),
    setupPersistence<ScopaSetupState>(SCOPA_SETUP_STORAGE_KEY, (stored) => {
      const mode = isScopaModeId(stored.mode) ? stored.mode : 'classic';
      return {
        mode,
        seats: clampScopaSeats(Number(stored.seats), mode),
        botTier: clampBotTier(Number(stored.botTier)),
      };
    }),
  ),
);
