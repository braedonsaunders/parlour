import { create } from 'zustand';
import { isModeId, type ModeId } from '@/lib/modes';

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
export const useSetupStore = create<SetupState>()((set) => ({
  mode: 'classic',
  seats: 4,
  botTier: 2,
  setMode: (mode) => set(isModeId(mode) ? { mode } : {}),
  setSeats: (seats) => set({ seats: clampSeats(seats) }),
  setBotTier: (tier) => set({ botTier: clampBotTier(tier) }),
}));
