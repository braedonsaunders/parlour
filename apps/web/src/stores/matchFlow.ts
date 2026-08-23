import { create } from 'zustand';
import type { MatchResult } from '@parlour/engine';
import type { SeatInfo } from '@/lib/seats';
import type { ModeId } from '@/lib/modes';

/** Everything the podium needs about the finished match. */
export interface MatchSnapshot {
  result: MatchResult;
  seats: readonly SeatInfo[];
  mode: ModeId;
  /** The human's seat, for jingle-vs-sting and the "you" framing; null when absent. */
  localSeat: number | null;
}

type MatchFlowState = {
  lastMatch: MatchSnapshot | null;
  /** Registered by the table so Play Again resumes the same room/settings in place. */
  playAgain: (() => void) | null;
  setLastMatch: (snapshot: MatchSnapshot) => void;
  registerPlayAgain: (handler: (() => void) | null) => void;
};

export const useMatchFlowStore = create<MatchFlowState>()((set) => ({
  lastMatch: null,
  playAgain: null,
  setLastMatch: (lastMatch) => set({ lastMatch }),
  registerPlayAgain: (playAgain) => set({ playAgain }),
}));
