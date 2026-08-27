'use client';

import { isModeId, type ModeId } from '@/lib/modes';
import { defineSetup } from '@/stores/gameSetup';

export const BLITZ_SETUP_STORAGE_KEY = 'parlour.blitz.setup.v1';

export type SeatCount = 2 | 3 | 4;
export type BotTier = 1 | 2 | 3;

export type SetupState = {
  mode: ModeId;
  seats: SeatCount;
  botTier: BotTier;
  /** Takes the registry's string ids; anything unknown is ignored. */
  setMode: (mode: string) => void;
  setSeats: (seats: number) => void;
  setBotTier: (tier: number) => void;
};

function clampSeats(value: number): SeatCount {
  if (value === 2 || value === 3 || value === 4) return value;
  return 4;
}

export function clampBotTier(value: number): BotTier {
  return value === 1 || value === 2 || value === 3 ? value : 2;
}

/** Solo session setup — UI/session state only; rule config comes from game-blitz's schema. */
export const useSetupStore = defineSetup(
  'blitz',
  {
    defaults: { mode: 'classic' as ModeId, seats: 4 as SeatCount, botTier: 2 as BotTier },
    coerce: (stored) => ({
      mode: isModeId(stored.mode) ? stored.mode : 'classic',
      seats: clampSeats(Number(stored.seats)),
      botTier: clampBotTier(Number(stored.botTier)),
    }),
  },
  (setup) => ({
    setMode: (mode: string) => {
      if (isModeId(mode)) setup.patch({ mode });
    },
    setSeats: (seats: number) => setup.patch({ seats: clampSeats(seats) }),
    setBotTier: (tier: number) => setup.patch({ botTier: clampBotTier(tier) }),
  }),
);
