import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { MatchResult } from '@parlour/engine';
import type { EightsModeId } from '@/lib/eights/modes';
import type { EuchreModeId } from '@/lib/euchre/modes';
import type { GameId } from '@/lib/games';
import type { HeartsModeId } from '@/lib/hearts/modes';
import type { ModeId } from '@/lib/modes';
import type { CribbageModeId } from '@/lib/cribbage/modes';
import type { GinModeId } from '@/lib/gin/modes';
import type { WildModeId } from '@/lib/wild/modes';
import type { RatscrewModeId } from '@/lib/ratscrew/modes';
import type { PresidentModeId } from '@/lib/president/modes';
import type { OhHellModeId } from '@/lib/ohhell/modes';
import type { PokerModeId } from '@/lib/poker/modes';
import type { SpadesModeId } from '@/lib/spades/modes';
import type { ScopaModeId } from '@/lib/scopa/modes';
import type { SpiteModeId } from '@/lib/spite/modes';
import type { DurakModeId } from '@/lib/durak/modes';
import type { PalaceModeId } from '@/lib/palace/modes';
import type { PinochleModeId } from '@/lib/pinochle/modes';
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
  mode:
    | ModeId
    | CribbageModeId
    | WildModeId
    | EightsModeId
    | RatscrewModeId
    | EuchreModeId
    | HeartsModeId
    | GinModeId
    | PresidentModeId
    | SpadesModeId
    | PokerModeId
    | OhHellModeId
    | ScopaModeId
    | SpiteModeId
    | DurakModeId
    | PalaceModeId
    | PinochleModeId;
  /** The human's seat, for jingle-vs-sting and the "you" framing; null when absent. */
  localSeat: number | null;
}

type MatchFlowState = {
  lastMatch: MatchSnapshot | null;
  /** Registered by the table so Play Again resumes the same room/settings in place. */
  playAgain: (() => void | Promise<void>) | null;
  setLastMatch: (snapshot: MatchSnapshot) => void;
  registerPlayAgain: (handler: (() => void | Promise<void>) | null) => void;
};

export const MATCH_FLOW_STORAGE_KEY = 'parlour.matchflow.v1';

/** Prerender has no session storage; persistence starts in the browser. */
const noStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};

/**
 * The finished match outlives the document.
 *
 * The table hands the podium its snapshot through this store and then routes to
 * `/match-end`. That is a soft navigation in the happy path, but it is not the
 * only way the podium gets rendered: a hard navigation, an iOS tab discard
 * under memory pressure, a service-worker refresh or a plain pull-to-refresh
 * all reload the document — and an in-memory store loses the match, so the
 * player who just won is told "No match on record".
 *
 * Session storage is the right scope: it survives a reload of this tab, and it
 * does not leak a stale podium into tomorrow's cold start. `playAgain` is a
 * closure over the table's router and cannot be serialised, so it stays in
 * memory and the podium falls back to the game's own route when it is gone.
 */
export const useMatchFlowStore = create<MatchFlowState>()(
  persist(
    (set) => ({
      lastMatch: null,
      playAgain: null,
      setLastMatch: (lastMatch) => set({ lastMatch }),
      registerPlayAgain: (playAgain) => set({ playAgain }),
    }),
    {
      name: MATCH_FLOW_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? noStorage : window.sessionStorage,
      ),
      partialize: (state) => ({ lastMatch: state.lastMatch }),
    },
  ),
);
