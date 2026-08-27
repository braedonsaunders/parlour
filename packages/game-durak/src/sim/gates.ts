import { aggregateWinRates, simulateGames, type WinRateRow } from '@parlour/engine';
import { DURAK_BOTS, durakTierBot } from '../bots/index';
import { durakConfig } from '../config';
import { createDurakDef } from '../game';

/**
 * Durak balance gates.
 *
 * Gate 1 — skill ladder: Hard against Easy at 4 seats, seats alternating so
 * position bias cannot flatter either tier. Hard must win more often than
 * Easy, measured by how many times it finishes above Easy in the rankings —
 * "finishes above" for Durak means "goes out earlier," since the whole point
 * is not to be the Durak.
 *
 * Gate 2 — tier band: a mixed table with one of each tier plus a second Easy
 * as filler. No tier may fall outside a healthy band.
 */

export const DEFAULT_THRESHOLDS = {
  hardAboveEasyMin: 0.55,
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

function ladderSeats(gameIndex: number): readonly (1 | 2 | 3)[] {
  return gameIndex % 2 === 0 ? [3, 1, 1, 3] : [1, 3, 3, 1];
}

function ladderLabels(gameIndex: number): readonly string[] {
  return gameIndex % 2 === 0
    ? ['Sharp', 'Easy', 'Easy', 'Sharp']
    : ['Easy', 'Sharp', 'Sharp', 'Easy'];
}

function mixedSeats(gameIndex: number): readonly (1 | 2 | 3)[] {
  const base = [3, 1, 2, 1] as const;
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
  const baseSeed = opts.baseSeed ?? 20_260_827;
  const thresholds = { ...DEFAULT_THRESHOLDS, ...opts.thresholds };

  const def = createDurakDef({ bots: DURAK_BOTS });
  const config = durakConfig.resolve({});

  const ladderRecords = simulateGames(def, games, {
    baseSeed,
    maxEvents: 4_000,
    config,
    tolerateStalls: true,
    seatPoliciesFor: (i) => ladderSeats(i).map(durakTierBot),
    seatLabelsFor: (i) => ladderLabels(i),
  });

  const tierRecords = simulateGames(def, games, {
    baseSeed: baseSeed + 40_000,
    maxEvents: 4_000,
    config,
    tolerateStalls: true,
    seatPoliciesFor: (i) => mixedSeats(i).map(durakTierBot),
    seatLabelsFor: (i) => mixedLabels(i),
  });

  const ladderRows = aggregateWinRates(ladderRecords, (record, seat) =>
    String(record.labels?.[seat] ?? seat),
  );
  const tierRows = aggregateWinRates(tierRecords, (record, seat) =>
    String(record.labels?.[seat] ?? seat),
  );

  const stalls = [...ladderRecords, ...tierRecords].filter((r) => r.stalled).length;

  // "Winning" at Durak means going out earlier. Count how often the Sharp
  // seat's best (lowest) rank beat the Easy seat's best rank.
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
  const hardAboveEasyRate = comparableGames > 0 ? hardAboveEasyCount / comparableGames : 0;

  const ladderPasses = hardAboveEasyRate >= thresholds.hardAboveEasyMin && games > 0;
  const tiersPasses = tierRows.every(
    (row) => row.winRate >= thresholds.tierBandMin && row.winRate <= thresholds.tierBandMax,
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
