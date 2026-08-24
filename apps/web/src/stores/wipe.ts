'use client';

import { create } from 'zustand';

export type WipeStatus = 'idle' | 'cover' | 'covered' | 'reveal';

type WipeState = {
  status: WipeStatus;
  /** Monotonic id so late timers from a previous journey can be ignored. */
  journeyId: number;
  target: string | null;
  origin: string | null;
  /** Set by the overlay once the pathname lands on `target` (or matches it already). */
  arrived: boolean;
  begin: (target: string, origin: string) => number;
  markCovered: () => void;
  markArrived: () => void;
  beginReveal: () => void;
  clear: () => void;
};

export const useWipeStore = create<WipeState>((set, get) => ({
  status: 'idle',
  journeyId: 0,
  target: null,
  origin: null,
  arrived: false,
  begin: (target, origin) => {
    const journeyId = get().journeyId + 1;
    set({ status: 'cover', journeyId, target, origin, arrived: false });
    return journeyId;
  },
  markCovered: () => set((state) => (state.status === 'cover' ? { status: 'covered' } : {})),
  markArrived: () => set({ arrived: true }),
  beginReveal: () =>
    set((state) => ({ status: state.status === 'reveal' ? state.status : 'reveal' })),
  clear: () =>
    set((state) =>
      state.status === 'reveal' ? { status: 'idle', target: null, origin: null } : {},
    ),
}));
