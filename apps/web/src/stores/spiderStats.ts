import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const SPIDER_STATS_STORAGE_KEY = 'parlour.spider.stats.v1';
const MAX_DAILY_RESULTS = 400;
const MAX_RUN_IDS = 80;

export interface SpiderDailyResult {
  key: string;
  bestMoves: number;
  bestTimeMs: number;
  completedAtMs: number;
}

export interface SpiderStatsState {
  dealsStarted: number;
  wins: number;
  bestMoves: number | null;
  bestTimeMs: number | null;
  dailyResults: readonly SpiderDailyResult[];
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

const EMPTY = {
  dealsStarted: 0,
  wins: 0,
  bestMoves: null,
  bestTimeMs: null,
  dailyResults: [] as readonly SpiderDailyResult[],
  startedRunIds: [] as readonly string[],
  wonRunIds: [] as readonly string[],
};

export const useSpiderStatsStore = create<SpiderStatsState>()(
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
      recordWin: ({ runId, dailyKey, moves, elapsedMs, completedAtMs }) =>
        set((state) => {
          if (state.wonRunIds.includes(runId)) return state;
          const safeMoves = safePositiveInt(moves);
          const safeTime = safePositiveInt(elapsedMs);
          const dailyResults = dailyKey
            ? upsertDaily(state.dailyResults, {
                key: dailyKey,
                bestMoves: safeMoves,
                bestTimeMs: safeTime,
                completedAtMs,
              })
            : state.dailyResults;
          return {
            wins: state.wins + 1,
            bestMoves: minimum(state.bestMoves, safeMoves),
            bestTimeMs: minimum(state.bestTimeMs, safeTime),
            dailyResults,
            wonRunIds: [runId, ...state.wonRunIds].slice(0, MAX_RUN_IDS),
          };
        }),
      reset: () => set(EMPTY),
    }),
    {
      name: SPIDER_STATS_STORAGE_KEY,
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

function safePositiveInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function minimum(current: number | null, next: number): number {
  return current === null ? next : Math.min(current, next);
}

function upsertDaily(
  current: readonly SpiderDailyResult[],
  result: SpiderDailyResult,
): SpiderDailyResult[] {
  const prior = current.find((entry) => entry.key === result.key);
  const next = prior
    ? {
        ...prior,
        bestMoves: Math.min(prior.bestMoves, result.bestMoves),
        bestTimeMs: Math.min(prior.bestTimeMs, result.bestTimeMs),
        completedAtMs: Math.max(prior.completedAtMs, result.completedAtMs),
      }
    : result;
  return [next, ...current.filter((entry) => entry.key !== result.key)]
    .sort((a, b) => b.key.localeCompare(a.key))
    .slice(0, MAX_DAILY_RESULTS);
}

export function dailyResultFor(
  results: readonly SpiderDailyResult[],
  key: string,
): SpiderDailyResult | null {
  return results.find((result) => result.key === key) ?? null;
}

/** Includes today when complete; otherwise a current streak may end yesterday. */
export function dailyStreak(results: readonly SpiderDailyResult[], todayKey: string): number {
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
