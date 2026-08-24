import { create } from 'zustand';
import type { WildModeId } from '@/lib/wild/modes';
import type { SeatCount } from '@/stores/setup';

export type WildSetupState = {
  mode: WildModeId;
  seats: SeatCount;
  setMode: (mode: WildModeId) => void;
  setSeats: (seats: number) => void;
};

function clampSeats(value: number): SeatCount {
  if (value === 2 || value === 3 || value === 4) return value;
  return 4;
}

/** Wild session setup — UI state only; rule values come from game-wildpile's presets. */
export const useWildSetupStore = create<WildSetupState>()((set) => ({
  mode: 'party',
  seats: 4,
  setMode: (mode) => set({ mode }),
  setSeats: (seats) => set({ seats: clampSeats(seats) }),
}));
