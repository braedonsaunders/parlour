import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The two shapes a solitaire keeps its records in.
 *
 * There were five of these files — klondike, freecell, spider, golf, pyramid —
 * and they were not merely similar. With the game name substituted out,
 * klondike, freecell and spider diffed to ZERO lines against each other, as did
 * golf against pyramid. Five files, 770 lines, and the only thing that actually
 * varied between members of a group was a storage key string.
 *
 * They are two factories rather than one because the two groups differ for a
 * real reason and not a cosmetic one: a klondike deal is won or it is not, so
 * its record is a win count and a personal best. A golf hole always finishes,
 * so its record is a score, a clear count, and a daily best that has to compare
 * on score first and only then on moves and time. Collapsing those into one
 * store with half its fields unused for either group would be a worse lie than
 * the duplication was.
 */

const MAX_DAILY_RESULTS = 400;
const MAX_RUN_IDS = 80;

export interface SolitaireDailyResult {
  key: string;
  bestMoves: number;
  bestTimeMs: number;
  completedAtMs: number;
}

export interface ScoredDailyResult extends SolitaireDailyResult {
  bestScore: number;
  cleared: boolean;
}

export interface WinStatsState {
  dealsStarted: number;
  wins: number;
  bestMoves: number | null;
  bestTimeMs: number | null;
  dailyResults: readonly SolitaireDailyResult[];
  startedRunIds: readonly string[];
  wonRunIds: readonly string[];
  recordStart: (runId: string) => void;
  recordWin: (input: {
    runId: string;
    dailyKey: string | null;
    moves: number;
    elapsedMs: number;
    completedAtMs: number;
  }) => void;
  reset: () => void;
}

export interface ScoreStatsState {
  dealsStarted: number;
  holesCompleted: number;
  clears: number;
  bestScore: number | null;
  /**
   * No top-level best-moves, deliberately: a golf or pyramid deal is judged on
   * what it left behind, and a lifetime "fewest moves" across boards of
   * different difficulty says nothing. Moves are kept per day, where the score
   * they belong to is known.
   */
  bestTimeMs: number | null;
  dailyResults: readonly ScoredDailyResult[];
  startedRunIds: readonly string[];
  finishedRunIds: readonly string[];
  recordStart: (runId: string) => void;
  recordHole: (input: {
    runId: string;
    dailyKey: string | null;
    leftover: number;
    moves: number;
    elapsedMs: number;
    completedAtMs: number;
  }) => void;
  reset: () => void;
}

function safePositiveInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function minimum(current: number | null, next: number): number {
  return current === null ? next : Math.min(current, next);
}

function newestFirst<T extends { key: string }>(results: readonly T[]): T[] {
  return [...results].sort((a, b) => b.key.localeCompare(a.key)).slice(0, MAX_DAILY_RESULTS);
}

/** A run already recorded must never count twice — a re-render is not a win. */
function remember(ids: readonly string[], runId: string): readonly string[] {
  return [runId, ...ids].slice(0, MAX_RUN_IDS);
}

const WIN_EMPTY = {
  dealsStarted: 0,
  wins: 0,
  bestMoves: null,
  bestTimeMs: null,
  dailyResults: [] as readonly SolitaireDailyResult[],
  startedRunIds: [] as readonly string[],
  wonRunIds: [] as readonly string[],
};

const SCORE_EMPTY = {
  dealsStarted: 0,
  holesCompleted: 0,
  clears: 0,
  bestScore: null,
  bestTimeMs: null,
  dailyResults: [] as readonly ScoredDailyResult[],
  startedRunIds: [] as readonly string[],
  finishedRunIds: [] as readonly string[],
};

/** Records for a solitaire you either win or you don't. */
export function createWinStatsStore(storageKey: string): UseBoundStore<StoreApi<WinStatsState>> {
  return create<WinStatsState>()(
    persist(
      (set) => ({
        ...WIN_EMPTY,
        recordStart: (runId) =>
          set((state) =>
            state.startedRunIds.includes(runId)
              ? state
              : {
                  dealsStarted: state.dealsStarted + 1,
                  startedRunIds: remember(state.startedRunIds, runId),
                },
          ),
        recordWin: ({ runId, dailyKey, moves, elapsedMs, completedAtMs }) =>
          set((state) => {
            if (state.wonRunIds.includes(runId)) return state;
            const safeMoves = safePositiveInt(moves);
            const safeTime = safePositiveInt(elapsedMs);
            return {
              wins: state.wins + 1,
              bestMoves: minimum(state.bestMoves, safeMoves),
              bestTimeMs: minimum(state.bestTimeMs, safeTime),
              dailyResults: dailyKey
                ? upsertWinDaily(state.dailyResults, {
                    key: dailyKey,
                    bestMoves: safeMoves,
                    bestTimeMs: safeTime,
                    completedAtMs,
                  })
                : state.dailyResults,
              wonRunIds: remember(state.wonRunIds, runId),
            };
          }),
        reset: () => set(WIN_EMPTY),
      }),
      {
        name: storageKey,
        version: 1,
        partialize: (state) => ({
          dealsStarted: state.dealsStarted,
          wins: state.wins,
          bestMoves: state.bestMoves,
          bestTimeMs: state.bestTimeMs,
          dailyResults: state.dailyResults,
          startedRunIds: state.startedRunIds,
          wonRunIds: state.wonRunIds,
        }),
      },
    ),
  );
}

/** Records for a solitaire whose deal always finishes, better or worse. */
export function createScoreStatsStore(
  storageKey: string,
): UseBoundStore<StoreApi<ScoreStatsState>> {
  return create<ScoreStatsState>()(
    persist(
      (set) => ({
        ...SCORE_EMPTY,
        recordStart: (runId) =>
          set((state) =>
            state.startedRunIds.includes(runId)
              ? state
              : {
                  dealsStarted: state.dealsStarted + 1,
                  startedRunIds: remember(state.startedRunIds, runId),
                },
          ),
        recordHole: ({ runId, dailyKey, leftover, moves, elapsedMs, completedAtMs }) =>
          set((state) => {
            if (state.finishedRunIds.includes(runId)) return state;
            const score = safePositiveInt(leftover);
            const safeMoves = safePositiveInt(moves);
            const safeTime = safePositiveInt(elapsedMs);
            const cleared = score === 0;
            return {
              holesCompleted: state.holesCompleted + 1,
              clears: state.clears + (cleared ? 1 : 0),
              bestScore: minimum(state.bestScore, score),
              // A time is only a record if the board actually came out.
              bestTimeMs: cleared ? minimum(state.bestTimeMs, safeTime) : state.bestTimeMs,
              dailyResults: dailyKey
                ? upsertScoreDaily(state.dailyResults, {
                    key: dailyKey,
                    bestScore: score,
                    bestMoves: safeMoves,
                    bestTimeMs: safeTime,
                    cleared,
                    completedAtMs,
                  })
                : state.dailyResults,
              finishedRunIds: remember(state.finishedRunIds, runId),
            };
          }),
        reset: () => set(SCORE_EMPTY),
      }),
      {
        name: storageKey,
        version: 1,
        partialize: (state) => ({
          dealsStarted: state.dealsStarted,
          holesCompleted: state.holesCompleted,
          clears: state.clears,
          bestScore: state.bestScore,
          bestTimeMs: state.bestTimeMs,
          dailyResults: state.dailyResults,
          startedRunIds: state.startedRunIds,
          finishedRunIds: state.finishedRunIds,
        }),
      },
    ),
  );
}

function upsertWinDaily(
  current: readonly SolitaireDailyResult[],
  result: SolitaireDailyResult,
): SolitaireDailyResult[] {
  const prior = current.find((entry) => entry.key === result.key);
  const next = prior
    ? {
        ...prior,
        bestMoves: Math.min(prior.bestMoves, result.bestMoves),
        bestTimeMs: Math.min(prior.bestTimeMs, result.bestTimeMs),
        completedAtMs: Math.max(prior.completedAtMs, result.completedAtMs),
      }
    : result;
  return newestFirst([next, ...current.filter((entry) => entry.key !== result.key)]);
}

function upsertScoreDaily(
  current: readonly ScoredDailyResult[],
  result: ScoredDailyResult,
): ScoredDailyResult[] {
  const prior = current.find((entry) => entry.key === result.key);
  const next = prior
    ? {
        ...prior,
        bestScore: Math.min(prior.bestScore, result.bestScore),
        // Moves and time belong to the better SCORE, not to the better number:
        // a tidier board beaten in fewer moves is still the worse day.
        bestMoves: betterOnScore(prior, result, 'bestMoves'),
        bestTimeMs: betterOnScore(prior, result, 'bestTimeMs'),
        cleared: prior.cleared || result.cleared,
        completedAtMs: Math.max(prior.completedAtMs, result.completedAtMs),
      }
    : result;
  return newestFirst([next, ...current.filter((entry) => entry.key !== result.key)]);
}

function betterOnScore(
  prior: ScoredDailyResult,
  result: ScoredDailyResult,
  field: 'bestMoves' | 'bestTimeMs',
): number {
  if (result.bestScore < prior.bestScore) return result[field];
  if (result.bestScore > prior.bestScore) return prior[field];
  return Math.min(prior[field], result[field]);
}

export function dailyResultFor<T extends { key: string }>(
  results: readonly T[],
  key: string,
): T | null {
  return results.find((result) => result.key === key) ?? null;
}

/** Includes today when complete; otherwise a current streak may end yesterday. */
export function dailyStreak(results: readonly { key: string }[], todayKey: string): number {
  const completed = new Set(results.map((result) => result.key));
  const cursor = utcDate(todayKey);
  if (!completed.has(todayKey)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (completed.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function utcDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}
