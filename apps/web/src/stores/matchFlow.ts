import { create } from 'zustand';
import type { MatchResult } from '@parlour/engine';
import type { GameId } from '@/lib/games';
import type { ModeId } from '@/lib/modes';
import type { WildModeId } from '@/lib/wild/modes';
import type { PresidentModeId } from '@/lib/president/modes';
import type { RecordedSeat } from '@/stores/history';

/** Everything the podium needs about the finished match. */
export interface MatchSnapshot {
  /**
   * Matches the history record id for this match, so the end screen can find
   * the ledger entry it just wrote and stand the rivalry up around it.
   */
  id?: string;
  result: MatchResult;
  /**
   * Seats carry their history keys as well as their faces — the same roster the
   * ledger was written with, so opponents stay identifiable after the match.
   */
  seats: readonly RecordedSeat[];
  /** Which shelf game produced this match; absent means Blitz (pre-Wild callers). */
  game?: GameId;
  mode: ModeId | WildModeId | PresidentModeId;
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
