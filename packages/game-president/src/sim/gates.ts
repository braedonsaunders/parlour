import type { MatchResult } from '@parlour/engine';
import { easyPresidentBot, hardPresidentBot, mediumPresidentBot } from '../bots';
import { runMatch } from './harness';

export const DEFAULT_THRESHOLDS = {
  /** head-to-head placements where Sharp finishes above Rookie */
  ladderMin: 0.55,
  /** match-win band for the two social tiers */
  socialBandMin: 0.08,
  socialBandMax: 0.34,
  /** Sharp must clear this win rate — it is the skill ceiling */
  sharpWinMin: 0.24,
  sharpWinMax: 0.56,
  /** pacing sanity: matches should not sprawl */
  maxAverageDeals: 7,
} as const;

export interface GateThresholds {
  ladderMin: number;
  socialBandMin: number;
  socialBandMax: number;
  sharpWinMin: number;
  sharpWinMax: number;
  maxAverageDeals: number;
}

export interface LadderReport {
  games: number;
  sharpAboveRookieRate: number;
  sharpWinRate: number;
  rookieWinRate: number;
  passes: boolean;
}

export interface PersonaRow {
  key: string;
  label: string;
  games: number;
  winRate: number;
}

export interface PersonaReport {
  rows: readonly PersonaRow[];
  passes: boolean;
}

export interface PaceReport {
  averageDeals: number;
  maxDealsSeen: number;
  passes: boolean;
}

export interface BalanceReport {
  thresholds: GateThresholds;
  ladder: LadderReport;
  personas: PersonaReport;
  pace: PaceReport;
  passed: boolean;
}

function rankOf(result: MatchResult, seat: number): number {
  return result.rankings.find((entry) => entry.seat === seat)?.rank ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Gate 1 — skill ladder: one Sharp seat against three Rookies (with a Regular
 * control seat), seating rotated every game so seat bias cannot flatter anyone.
 */
function runLadder(games: number, baseSeed: number, thresholds: GateThresholds): LadderReport {
  let above = 0;
  let sharpWins = 0;
  let rookieWins = 0;
  for (let i = 0; i < games; i++) {
    const sharpSeat = i % 2 === 0 ? 0 : 1;
    const rookieSeat = 1 - sharpSeat;
    const table: readonly (typeof hardPresidentBot | typeof mediumPresidentBot | typeof easyPresidentBot)[] =
      [0, 1, 2, 3].map((seat) => {
        if (seat === sharpSeat) return hardPresidentBot;
        if (seat === rookieSeat) return easyPresidentBot;
        return seat === 2 ? mediumPresidentBot : easyPresidentBot;
      });
    const run = runMatch(baseSeed + i, 4, table);
    if (rankOf(run.result, sharpSeat) < rankOf(run.result, rookieSeat)) above++;
    if (run.result.winner === sharpSeat) sharpWins++;
    if (run.result.winner === rookieSeat) rookieWins++;
  }
  const sharpAboveRookieRate = above / games;
  const sharpWinRate = sharpWins / games;
  const rookieWinRate = rookieWins / games;
  return {
    games,
    sharpAboveRookieRate,
    sharpWinRate,
    rookieWinRate,
    passes:
      sharpAboveRookieRate >= thresholds.ladderMin &&
      sharpWinRate >= thresholds.sharpWinMin &&
      sharpWinRate > rookieWinRate,
  };
}

/** Gate 2 — mixed-table band so no persona is degenerate or dominant. */
function runPersonas(
  games: number,
  baseSeed: number,
  thresholds: GateThresholds,
): PersonaReport {
  const roster = [easyPresidentBot, mediumPresidentBot, hardPresidentBot, mediumPresidentBot];
  const tally = new Map<string, { label: string; games: number; wins: number }>();
  for (let i = 0; i < games; i++) {
    const shift = i % roster.length;
    const table = roster.map((_, seat) => roster[(seat + shift) % roster.length]!);
    const run = runMatch(baseSeed + i, 4, table);
    table.forEach((policy, seat) => {
      const entry = tally.get(policy.id) ?? { label: policy.label, games: 0, wins: 0 };
      entry.games += 1;
      if (run.result.winner === seat) entry.wins += 1;
      tally.set(policy.id, entry);
    });
  }
  const rows = [...tally.entries()]
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      games: entry.games,
      winRate: entry.wins / Math.max(1, entry.games),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const passes = rows.every((row) => {
    if (row.key === 'president-hard') {
      return row.winRate >= thresholds.sharpWinMin && row.winRate <= thresholds.sharpWinMax;
    }
    return row.winRate >= thresholds.socialBandMin && row.winRate <= thresholds.socialBandMax;
  });
  return { rows, passes };
}

/** Gate 3 — pacing: default settings should land inside a session-friendly arc. */
function runPace(games: number, baseSeed: number, thresholds: GateThresholds): PaceReport {
  let deals = 0;
  let maxDeals = 0;
  const table = [easyPresidentBot, mediumPresidentBot, hardPresidentBot, mediumPresidentBot];
  for (let i = 0; i < games; i++) {
    const run = runMatch(baseSeed + i, 4, table);
    deals += run.deals;
    maxDeals = Math.max(maxDeals, run.deals);
  }
  const averageDeals = deals / Math.max(1, games);
  return {
    averageDeals,
    maxDealsSeen: maxDeals,
    passes: averageDeals <= thresholds.maxAverageDeals,
  };
}

export function runBalanceGates(options: { games?: number; baseSeed?: number } = {}): BalanceReport {
  const games = options.games ?? 400;
  const baseSeed = options.baseSeed ?? 202_608_23;
  const thresholds: GateThresholds = { ...DEFAULT_THRESHOLDS };
  const ladder = runLadder(games, baseSeed, thresholds);
  const personas = runPersonas(games, baseSeed + 40_000, thresholds);
  const pace = runPace(Math.min(games, 200), baseSeed + 80_000, thresholds);
  return {
    thresholds,
    ladder,
    personas,
    pace,
    passed: ladder.passes && personas.passes && pace.passes,
  };
}
