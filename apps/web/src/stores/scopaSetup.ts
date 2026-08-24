import { create } from 'zustand';
import { GAME_SEATS } from '@parlour/game-scopa';
import type { ScopaModeId } from '@/lib/scopa/modes';
import { clampBotTier, type BotTier } from '@/stores/setup';

export type ScopaSetupState = {
  mode: ScopaModeId;
  seats: number;
  botTier: BotTier;
  setMode: (mode: ScopaModeId) => void;
  setSeats: (seats: number) => void;
  setBotTier: (tier: number) => void;
};

/**
 * Scopa seats 2, 3, 4 or 6 — not 5, because partnerships at 4 and 6 need an
 * even table and a five-hand deal does not divide the 40-card deck.
 */
export function clampScopaSeats(seats: number): number {
  return (GAME_SEATS as readonly number[]).includes(seats) ? seats : 2;
}

/** Scopa session setup — UI state only; rule values come from pack presets. */
export const useScopaSetupStore = create<ScopaSetupState>()((set) => ({
  mode: 'classic',
  seats: 2,
  botTier: 2,
  setMode: (mode) => set({ mode }),
  setSeats: (seats) => set({ seats: clampScopaSeats(seats) }),
  setBotTier: (tier) => set({ botTier: clampBotTier(tier) }),
}));
