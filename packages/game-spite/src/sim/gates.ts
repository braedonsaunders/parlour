import {
  aggregateWinRates,
  simulateGames,
  type SimulationRecord,
  type WinRateRow,
} from '@parlour/engine';
import { PERSONAS, makePersonaBot } from '../bots/personas';
import { spiteTierBot } from '../bots';
import { spiteGame } from '../game';
import { spiteConfig } from '../config';

/**
 * Machine-checked balance gates for Spite & Malice:
 *   1. Hard beats Easy ≥ headToHeadMin head-to-head (seats swap every game).
 *   2. No persona is degenerate on a mixed four-seat table — everyone lands
 *      inside a wide win-rate band.
 *   3. Identical policies produce a roughly even split (symmetry).
 *   4. Stall rate at or near zero.
 *
 * Pure and deterministic for a given (games, baseSeed) — the CLI is a thin
 * printer over this module. The default vitest suite samples small fixed-seed
 * runs; `pnpm --filter @parlour/game-spite sim -- --games N` is the ladder.
 */

export interface GateThresholds {
  headToHeadMin: number;
  personaBandMin: number;
  personaBandMax: number;
  symmetryBandMin: number;
  symmetryBandMax: number;
  /** fraction of abandoned games tolerated before the run fails outright */
  maxStallRate: number;
}

export const DEFAULT_THRESHOLDS: GateThresholds = {
  headToHeadMin: 0.62,
  personaBandMin: 0.13,
  personaBandMax: 0.42,
  symmetryBandMin: 0.4,
  symmetryBandMax: 0.6,
  maxStallRate: 0.005,
};

export interface HeadToHeadGate {
  hardWinRate: number;
  easyWinRate: number;
  games: number;
  passes: boolean;
}

export interface PersonaGate {
  rows: WinRateRow[];
  failures: string[];
  games: number;
  passes: boolean;
}

export interface SymmetryGate {
  seatZeroShare: number | null;
  games: number;
  passes: boolean;
}

export interface GateReport {
  gamesPerPhase: number;
  baseSeed: number;
  thresholds: GateThresholds;
  headToHead: HeadToHeadGate;
  personas: PersonaGate;
  symmetry: SymmetryGate;
  stalls: number;
  passed: boolean;
}

/**
 * Quick preset: shorter payoffs keep gate runs brisk.
 *
 * It does change the shape, though, which is why the head-to-head gate does not
 * use it. A ten-card payoff is a shorter, luckier game, and it compresses the
 * skill gap: the same Hard bot beats Easy 67% at the default twenty-card payoff
 * and only 57% at ten. Measuring tier strength on a config nobody plays would
 * have had us tuning the bot to fix the harness.
 */
const quickConfig = () => spiteConfig.resolve({ payoffSize: 10 });

/** The payoff length Classic actually deals — what the tier gate measures. */
const classicConfig = () => spiteConfig.resolve({});

const gameDef = () => spiteGame;

function recordLabel(record: SimulationRecord, seat: number): string {
  const label = record.labels?.[seat];
  if (!label) throw new Error('simulation record is missing a seat label');
  return label;
}

function countStalls(records: readonly SimulationRecord[]): number {
  let count = 0;
  for (const record of records) if (record.stalled) count += 1;
  return count;
}

/** all ordered seat assignments of 4 personas out of the roster, fixed order */
function personaCombos(): string[][] {
  const combos: string[][] = [];
  const current: string[] = [];
  const walk = (start: number) => {
    if (current.length === 4) {
      combos.push(current.slice());
      return;
    }
    for (let p = start; p < PERSONAS.length; p++) {
      current.push(PERSONAS[p]!.id);
      walk(p + 1);
      current.pop();
    }
  };
  walk(0);
  return combos;
}

const COMBOS = personaCombos();

export function runBalanceGates(opts: {
  games: number;
  baseSeed?: number;
  thresholds?: GateThresholds;
}): GateReport {
  const games = opts.games;
  if (!Number.isInteger(games) || games <= 0) {
    throw new Error(`runBalanceGates: games must be a positive integer, got ${games}`);
  }
  const baseSeed = opts.baseSeed ?? 20_260_824;
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;

  // --- gate 1: Hard vs Easy head-to-head, seats swapping -------------------
  const h2hRecords = simulateGames(gameDef(), games, {
    baseSeed,
    config: classicConfig(),
    tolerateStalls: true,
    seatPoliciesFor: (index) =>
      index % 2 === 0 ? [spiteTierBot(3), spiteTierBot(1)] : [spiteTierBot(1), spiteTierBot(3)],
    seatLabelsFor: (index) => (index % 2 === 0 ? ['hard', 'easy'] : ['easy', 'hard']),
  });
  const h2hRows = aggregateWinRates(h2hRecords, recordLabel);
  const hardWinRate = h2hRows.find((row) => row.key === 'hard')?.winRate ?? 0;
  const easyWinRate = h2hRows.find((row) => row.key === 'easy')?.winRate ?? 0;

  // --- gate 2: mixed-persona band ------------------------------------------
  const personaRecords = simulateGames(gameDef(), games, {
    baseSeed: baseSeed ^ 0x5eed,
    config: quickConfig(),
    tolerateStalls: true,
    seatPoliciesFor: (index) =>
      (COMBOS[index % COMBOS.length] as string[]).map((id) => makePersonaBot(id)),
    seatLabelsFor: (index) => COMBOS[index % COMBOS.length] as string[],
  });
  const personaRows = aggregateWinRates(personaRecords, recordLabel);

  // --- gate 3: identical policies split evenly ------------------------------
  const symmetryGames = Math.max(8, Math.floor(games / 2));
  const symmetricRecords = simulateGames(gameDef(), symmetryGames, {
    baseSeed: baseSeed ^ 0xa11ce,
    config: quickConfig(),
    tolerateStalls: true,
    seatPoliciesFor: () => [spiteTierBot(2), spiteTierBot(2)],
    seatLabelsFor: () => ['medium', 'medium'],
  });

  return assemble(thresholds, games, baseSeed, h2hRecords, personaRows, symmetricRecords);

  function assemble(
    limits: GateThresholds,
    gameCount: number,
    seedBase: number,
    headToHeadRecords: readonly SimulationRecord[],
    rows: WinRateRow[],
    symmetryRecords: readonly SimulationRecord[],
  ): GateReport {
    let seatZeroWins = 0;
    let settled = 0;
    for (const record of symmetryRecords) {
      if (record.stalled || !record.result || record.winners.length !== 1) continue;
      settled += 1;
      if (record.winners[0] === 0) seatZeroWins += 1;
    }
    const share = settled > 0 ? seatZeroWins / settled : null;

    const failures: string[] = [];
    for (const row of rows) {
      if (row.winRate < limits.personaBandMin || row.winRate > limits.personaBandMax) {
        failures.push(
          `${row.key}: win rate ${pct(row.winRate)} outside band ${pct(limits.personaBandMin)}–${pct(limits.personaBandMax)}`,
        );
      }
    }

    const headToHead: HeadToHeadGate = {
      hardWinRate,
      easyWinRate,
      games: gameCount,
      passes: hardWinRate >= limits.headToHeadMin,
    };
    const personas: PersonaGate = {
      rows,
      failures,
      games: gameCount,
      passes: failures.length === 0 && rows.length === PERSONAS.length,
    };
    const symmetry: SymmetryGate = {
      seatZeroShare: share,
      games: symmetryGames,
      passes: share !== null && share >= limits.symmetryBandMin && share <= limits.symmetryBandMax,
    };

    const stalls =
      countStalls(headToHeadRecords) + countStalls(personaRecords) + countStalls(symmetryRecords);
    const totalGames = gameCount * 2 + symmetryGames;
    const passed =
      headToHead.passes &&
      personas.passes &&
      symmetry.passes &&
      stalls / Math.max(1, totalGames) <= limits.maxStallRate;

    return {
      gamesPerPhase: gameCount,
      baseSeed: seedBase,
      thresholds: limits,
      headToHead,
      personas,
      symmetry,
      stalls,
      passed,
    };
  }
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
