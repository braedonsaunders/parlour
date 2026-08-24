import { create } from 'zustand';
import type { PresidentModeId } from '@/lib/president/modes';

export const PRESIDENT_SEAT_OPTIONS = [4, 5, 6, 7, 8] as const;

export type PresidentSetupState = {
  mode: PresidentModeId;
  seats: number;
  setMode: (mode: PresidentModeId) => void;
  setSeats: (seats: number) => void;
};

function clampSeats(value: number): number {
  return (PRESIDENT_SEAT_OPTIONS as readonly number[]).includes(value) ? value : 5;
}

/** President session setup — UI state only; rules come from the game's presets. */
export const usePresidentSetupStore = create<PresidentSetupState>()((set) => ({
  mode: 'classic',
  seats: 5,
  setMode: (mode) => set({ mode }),
  setSeats: (seats) => set({ seats: clampSeats(seats) }),
}));
