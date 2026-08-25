import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const PYRAMID_STATS_STORAGE_KEY = 'parlour.pyramid.stats.v1';
const MAX_DAILY_RESULTS = 400;
const MAX_RUN_IDS = 80;

export interface PyramidDailyResult {
  key: string;
  bestScore: number;
  bestMoves: number;
  bestTimeMs: number;
  cleared: boolean;
  completedAtMs: number;
}

export interface PyramidStatsState {
  dealsStarted: number;
  holesCompleted: number;
  clears: number;
  bestScore: number | null;
  bestTimeMs: number | null;
  dailyResults: readonly PyramidDailyResult[];
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

const EMPTY = {
  dealsStarted: 0,
  holesCompleted: 0,
  clears: 0,
  bestScore: null,
  bestTimeMs: null,
  dailyResults: [] as readonly PyramidDailyResult[],
  startedRunIds: [] as readonly string[],
  finishedRunIds: [] as readonly string[],
};

export const usePyramidStatsStore = create<PyramidStatsState>()(
  persist(
    (set) => ({
      ...EMPTY,
      recordStart: (runId) =>
        set((state) =>
          state.startedRunIds.includes(runId)
            ? state
            : {
                dealsStarted: state.dealsStarted + 1,
                startedRunIds: [runId, ...state.startedRunIds].slice(0, MAX_RUN_IDS),
              },
        ),
      recordHole: ({ runId, dailyKey, leftover, moves, elapsedMs, completedAtMs }) =>
        set((state) => {
          if (state.finishedRunIds.includes(runId)) return state;
          const score = safePositiveInt(leftover);
          const safeMoves = safePositiveInt(moves);
          const safeTime = safePositiveInt(elapsedMs);
          const cleared = score === 0;
          const dailyResults = dailyKey
            ? upsertDaily(state.dailyResults, {
                key: dailyKey,
                bestScore: score,
                bestMoves: safeMoves,
                bestTimeMs: safeTime,
                cleared,
                completedAtMs,
              })
            : state.dailyResults;
          return {
            holesCompleted: state.holesCompleted + 1,
            clears: state.clears + (cleared ? 1 : 0),
            bestScore: minimum(state.bestScore, score),
            bestTimeMs: cleared ? minimum(state.bestTimeMs, safeTime) : state.bestTimeMs,
            dailyResults,
            finishedRunIds: [runId, ...state.finishedRunIds].slice(0, MAX_RUN_IDS),
          };
        }),
      reset: () => set(EMPTY),
    }),
    {
      name: PYRAMID_STATS_STORAGE_KEY,
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

function safePositiveInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function minimum(current: number | null, next: number): number {
  return current === null ? next : Math.min(current, next);
}

function upsertDaily(
  current: readonly PyramidDailyResult[],
  result: PyramidDailyResult,
): PyramidDailyResult[] {
  const prior = current.find((entry) => entry.key === result.key);
  const next = prior
    ? {
        ...prior,
        bestScore: Math.min(prior.bestScore, result.bestScore),
        bestMoves: betterMoves(prior, result),
        bestTimeMs: betterTime(prior, result),
        cleared: prior.cleared || result.cleared,
        completedAtMs: Math.max(prior.completedAtMs, result.completedAtMs),
      }
    : result;
  return [next, ...current.filter((entry) => entry.key !== result.key)]
    .sort((a, b) => b.key.localeCompare(a.key))
    .slice(0, MAX_DAILY_RESULTS);
}

function betterMoves(prior: PyramidDailyResult, result: PyramidDailyResult): number {
  if (result.bestScore < prior.bestScore) return result.bestMoves;
  if (result.bestScore > prior.bestScore) return prior.bestMoves;
  return Math.min(prior.bestMoves, result.bestMoves);
}

function betterTime(prior: PyramidDailyResult, result: PyramidDailyResult): number {
  if (result.bestScore < prior.bestScore) return result.bestTimeMs;
  if (result.bestScore > prior.bestScore) return prior.bestTimeMs;
  return Math.min(prior.bestTimeMs, result.bestTimeMs);
}

export function dailyResultFor(
  results: readonly PyramidDailyResult[],
  key: string,
): PyramidDailyResult | null {
  return results.find((result) => result.key === key) ?? null;
}

/** Includes today when complete; otherwise a current streak may end yesterday. */
export function dailyStreak(results: readonly PyramidDailyResult[], todayKey: string): number {
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
