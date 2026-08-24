import {
  aggregateWinRates,
  runBotGame,
  simulateGames,
  type SimulationRecord,
  type WinRateRow,
  type SeatPolicies,
} from '@parlour/engine';
import { createGinMatchDef } from '../matchGame';
import { createGinHandDef } from '../rules';
import type { GinConfig, GinState } from '../index';
import { ginConfigSchema } from '../config';
import { GIN_PERSONAS, ginTierBot, makeGinPersonaBot } from '../bots';

/**
 * Balance gates, machine-checked (mirrors Blitz's sim contract):
 *   1. Hard beats Easy ≥ 65% of hands head-to-head (seats alternate).
 *   2. No persona is degenerate: every persona's hand-win rate stays inside
 *      the 35–65% band across two-seat round-robin play.
 *
 * Gates run over single hands (the hand def) — a full match is just repeats.
 * Pure and deterministic for a given (games, baseSeed); the CLI prints it.
 */

export interface GateThresholds {
  headToHeadMin: number;
  personaBandMin: number;
  personaBandMax: number;
  maxStallRate: number;
}

export const DEFAULT_THRESHOLDS: GateThresholds = {
  headToHeadMin: 0.65,
  personaBandMin: 0.35,
  personaBandMax: 0.65,
  maxStallRate: 0.005,
};

export interface GateReport {
  gamesPerPhase: number;
  baseSeed: number;
  thresholds: GateThresholds;
  headToHead: { hardWinRate: number; easyWinRate: number; games: number; passes: boolean };
  personas: { rows: WinRateRow[]; failures: string[]; passes: boolean };
  stalls: number;
  passed: boolean;
}

const HANDS = createGinHandDef({ bots: [] });
const CONFIG: Partial<GinConfig> = ginConfigSchema.defaults();

export function runBalanceGates(opts: {
  games: number;
  baseSeed?: number;
  thresholds?: GateThresholds;
}): GateReport {
  const games = opts.games;
  if (!Number.isInteger(games) || games <= 0) {
    throw new Error(`runBalanceGates: games must be a positive integer, got ${games}`);
  }
  const baseSeed = opts.baseSeed ?? 20260824;
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;

  // gate 1 — Hard vs Easy, seats alternating
  const h2hRecords = simulateGames(HANDS, games, {
    baseSeed,
    config: CONFIG,
    tolerateStalls: true,
    seatPoliciesFor: (i) => [ginTierBot(i % 2 === 0 ? 3 : 1), ginTierBot(i % 2 === 0 ? 1 : 3)],
    seatLabelsFor: (i) => (i % 2 === 0 ? ['hard', 'easy'] : ['easy', 'hard']),
  });
  const rows = aggregateWinRates(h2hRecords, labelOf);
  const hardRow = rows.find((row) => row.key === 'hard');
  const easyRow = rows.find((row) => row.key === 'easy');
  const hardWinRate = hardRow?.winRate ?? 0;
  const easyWinRate = easyRow?.winRate ?? 0;

  // gate 2 — persona round robin (every ordered pair, both seat orders)
  const pairs = orderedPersonaPairs();
  const personaRecords = simulateGames(HANDS, games, {
    baseSeed: baseSeed ^ 0x9e37,
    config: CONFIG,
    tolerateStalls: true,
    seatPoliciesFor: (i) => pairPolicies(pairs[i % pairs.length]!),
    seatLabelsFor: (i) => pairLabels(pairs[i % pairs.length]!),
  });
  const personaRows = aggregateWinRates(personaRecords, labelOf);

  const failures: string[] = [];
  for (const row of personaRows) {
    if (row.winRate < thresholds.personaBandMin || row.winRate > thresholds.personaBandMax) {
      failures.push(
        `${row.key}: ${(row.winRate * 100).toFixed(1)}% outside ` +
          `${(thresholds.personaBandMin * 100).toFixed(0)}–${(thresholds.personaBandMax * 100).toFixed(0)}%`,
      );
    }
  }

  const stalls =
    h2hRecords.filter((record) => record.stalled).length +
    personaRecords.filter((record) => record.stalled).length;

  const headToHeadPasses = hardWinRate >= thresholds.headToHeadMin;
  const personasPass = failures.length === 0 && personaRows.length === GIN_PERSONAS.length;
  const passed =
    headToHeadPasses &&
    personasPass &&
    stalls / Math.max(1, 2 * games) <= thresholds.maxStallRate;

  return {
    gamesPerPhase: games,
    baseSeed,
    thresholds,
    headToHead: {
      hardWinRate,
      easyWinRate,
      games,
      passes: headToHeadPasses,
    },
    personas: { rows: personaRows, failures, passes: personasPass },
    stalls,
    passed,
  };
}

function orderedPersonaPairs(): number[][] {
  const pairs: number[][] = [];
  for (let a = 0; a < GIN_PERSONAS.length; a++) {
    for (let b = 0; b < GIN_PERSONAS.length; b++) {
      if (a !== b) pairs.push([a, b]);
    }
  }
  return pairs;
}

function pairPolicies(pair: readonly number[]): SeatPolicies<GinState> {
  const first = GIN_PERSONAS[pair[0] as number]!;
  const second = GIN_PERSONAS[pair[1] as number]!;
  return [makeGinPersonaBot(first.id), makeGinPersonaBot(second.id)];
}

function pairLabels(pair: readonly number[]): string[] {
  return [GIN_PERSONAS[pair[0] as number]!.id, GIN_PERSONAS[pair[1] as number]!.id];
}

function labelOf(record: SimulationRecord, seat: number): string {
  const label = record.labels?.[seat];
  if (!label) throw new Error('simulation record is missing a seat label');
  return label;
}

/** Smoke check used by tests: the match def completes end-to-end with bots. */
export function playOneBotMatch(seed: number): SimulationRecord {
  const match = createGinMatchDef({ bots: [] });
  void match;
  const record = runBotGame(createGinHandDef(), {
    seed,
    policies: [ginTierBot(3), ginTierBot(2)],
    config: ginConfigSchema.resolve({ matchTarget: 50 }),
  });
  return { ...record, winners: winnersOf(record.result) };
}

function winnersOf(result: { winner: number | null } | null): number[] {
  return result && result.winner !== null ? [result.winner] : [];
}
