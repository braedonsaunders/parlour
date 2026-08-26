import {
  aggregateWinRates,
  simulateGames,
  type WinRateRow,
} from '@parlour/engine';
import { EIGHTS_BOTS, eightsTierBot } from '../bots/index';
import { eightsConfig } from '../config';
import { createEightsDef } from '../game';

/**
 * Eights balance gates.
 *
 * Gate 1 — skill ladder: Hard against Easy at 4 seats, seats alternating
 * so position bias cannot flatter either tier. Hard must win more often than
 * Easy, measured by how many times it finishes above Easy in the rankings.
 *
 * Gate 2 — tier band: a mixed table with one of each tier plus a second
 * Easy as filler. No tier may fall outside a healthy band.
 *
 * Eights is higher-variance than Blitz (each hand is a lottery of what the
 * draw pile gives you), so gates are calibrated on measured bands not vibes.
 */

export const DEFAULT_THRESHOLDS = {
  /** head-to-head: Hard must outplace Easy this often */
  hardAboveEasyMin: 0.45,
  /** mixed tables: nobody may fall outside this band */
  tierBandMin: 0.1,
  tierBandMax: 0.45,
} as const;

export type Thresholds = typeof DEFAULT_THRESHOLDS;

export interface GateReport {
  passed: boolean;
  games: number;
  stalls: number;
  ladder: { rows: WinRateRow[]; hardAboveEasyRate: number; passes: boolean };
  tiers: { rows: WinRateRow[]; passes: boolean };
  thresholds: Thresholds;
}

/** Hard vs Easy, seats alternating to cancel position bias. */
function ladderSeats(gameIndex: number): readonly number[] {
  return gameIndex % 2 === 0 ? [2, 0, 0, 2] : [0, 2, 2, 0];
}

function ladderLabels(gameIndex: number): readonly string[] {
  return gameIndex % 2 === 0
    ? ['Sharp', 'Easy', 'Easy', 'Sharp']
    : ['Easy', 'Sharp', 'Sharp', 'Easy'];
}

/** Mixed table: one of each tier + second Easy, rotated per game. */
function mixedSeats(gameIndex: number): readonly number[] {
  const base = [2, 0, 1, 0] as const;
  return Array.from({ length: 4 }, (_, offset) => base[(gameIndex + offset) % 4]!);
}

function mixedLabels(gameIndex: number): readonly string[] {
  const base = ['Sharp', 'Easy', 'Regular', 'Easy'] as const;
  return Array.from({ length: 4 }, (_, offset) => base[(gameIndex + offset) % 4]!);
}

export function runBalanceGates(opts: {
  games: number;
  baseSeed?: number;
  thresholds?: Partial<Thresholds>;
}): GateReport {
  const games = Math.max(0, Math.floor(opts.games));
  const baseSeed = opts.baseSeed ?? 20_260_824;
  const thresholds = { ...DEFAULT_THRESHOLDS, ...opts.thresholds };

  const def = createEightsDef({ bots: EIGHTS_BOTS });
  // Short target so matches finish inside the event budget.
  const config = eightsConfig.resolve({ targetScore: 50 });

  // Gate 1: ladder
  const ladderRecords = simulateGames(def, games, {
    baseSeed,
    maxEvents: 4_000,
    config,
    tolerateStalls: true,
    seatPoliciesFor: (i) => ladderSeats(i).map((t) => eightsTierBot((t || 1) as 1 | 2 | 3)),
    seatLabelsFor: (i) => ladderLabels(i),
  });

  // Gate 2: mixed tiers
  const tierRecords = simulateGames(def, games, {
    baseSeed: baseSeed + 40_000,
    maxEvents: 4_000,
    config,
    tolerateStalls: true,
    seatPoliciesFor: (i) => mixedSeats(i).map((t) => eightsTierBot((t || 1) as 1 | 2 | 3)),
    seatLabelsFor: (i) => mixedLabels(i),
  });

  const ladderRows = aggregateWinRates(ladderRecords, (record, seat) =>
    String(record.labels?.[seat] ?? seat),
  );
  const tierRows = aggregateWinRates(tierRecords, (record, seat) =>
    String(record.labels?.[seat] ?? seat),
  );

  const stalls = [...ladderRecords, ...tierRecords].filter((r) => r.stalled).length;

  // Hard above Easy rate from ladder games: count how many times a Sharp seat
  // finished above an Easy seat.
  let hardAboveEasyCount = 0;
  let comparableGames = 0;
  for (const record of ladderRecords) {
    if (record.stalled || !record.result) continue;
    comparableGames++;
    const sharpRanks = record.result.rankings
      .filter((r) => record.labels?.[r.seat] === 'Sharp')
      .map((r) => r.rank);
    const easyRanks = record.result.rankings
      .filter((r) => record.labels?.[r.seat] === 'Easy')
      .map((r) => r.rank);
    const sharpBest = Math.min(...sharpRanks);
    const easyBest = Math.min(...easyRanks);
    if (sharpBest < easyBest) hardAboveEasyCount++;
  }
  const hardAboveEasyRate =
    comparableGames > 0 ? hardAboveEasyCount / comparableGames : 0;

  const ladderPasses =
    hardAboveEasyRate >= thresholds.hardAboveEasyMin && games > 0;

  const tiersPasses = tierRows.every(
    (row) =>
      row.winRate >= thresholds.tierBandMin && row.winRate <= thresholds.tierBandMax,
  );

  const passed = ladderPasses && tiersPasses && stalls === 0 && games > 0;

  return {
    passed,
    games,
    stalls,
    ladder: { rows: ladderRows, hardAboveEasyRate, passes: ladderPasses },
    tiers: { rows: tierRows, passes: tiersPasses },
    thresholds,
  };
}