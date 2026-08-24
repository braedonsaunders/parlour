import {
  aggregateWinRates,
  simulateGames,
  type SimulationRecord,
  type WinRateRow,
} from '@parlour/engine';
import { TIER_BOTS, tierBot } from '../bots';
import { makePersonaBot, PERSONAS } from '../bots/personas';
import { scopaConfig } from '../config';
import { scopaGame } from '../game';

/**
 * Machine-checked balance gates for Scopa:
 *   1. Hard beats Easy heads-up ≥ 55% (seats swap halves).
 *   2. Persona win share stays inside a wide mixed-table band.
 *   3. Identical policies give seat 0 a roughly even split.
 *   4. Stall rate at or near zero.
 *
 * Seat counts differ per gate on purpose: heads-up isolates skill, four seats
 * stress the partnership pooling the personas' points flow through.
 */

export interface GateThresholds {
  headToHeadMin: number;
  personaBandMin: number;
  personaBandMax: number;
  symmetryBandMin: number;
  symmetryBandMax: number;
  maxStallRate: number;
}

export const DEFAULT_THRESHOLDS: GateThresholds = {
  headToHeadMin: 0.55,
  personaBandMin: 0.25,
  personaBandMax: 0.75,
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

const gameDef = () => scopaGame;
const quickConfig = () => scopaConfig.resolve({ target: 11 });

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

/** All k-persona combinations, in stable order, cycled by game index. */
export function personaCombos(k: number): string[][] {
  const combos: string[][] = [];
  const walk = (start: number, current: number[]): void => {
    if (current.length === k) {
      combos.push(current.map((index) => PERSONAS[index]!.id));
      return;
    }
    for (let p = start; p < PERSONAS.length; p++) walk(p + 1, [...current, p]);
  };
  walk(0, []);
  return combos;
}

/**
 * Fraction of decided games won by seats of the given parity. At two seats
 * that is a plain heads-up share; at partnership sizes a team win counts once
 * whether one or both partners appear in `winners`.
 */
export function seatParityShare(
  records: readonly SimulationRecord[],
  parity: 0 | 1,
): number | null {
  let credits = 0;
  let counted = 0;
  for (const record of records) {
    if (record.stalled || !record.result || record.winners.length === 0) continue;
    counted += 1;
    const won = record.winners.some((seat) => seat % 2 === parity);
    const lost = record.winners.some((seat) => seat % 2 !== parity);
    // split wins (a tied match cannot happen here, but stay honest anyway)
    credits += won && !lost ? 1 : won && lost ? 0.5 : 0;
  }
  return counted > 0 ? credits / counted : null;
}

export function personaRates(
  records: readonly SimulationRecord[],
): { key: string; games: number; rate: number }[] {
  const rows = new Map<string, { games: number; wins: number }>();
  for (const record of records) {
    if (record.stalled || !record.result || record.winners.length === 0) continue;
    const winningParity = record.winners[0]! % 2;
    for (let seat = 0; seat < record.seats; seat++) {
      const key = record.labels?.[seat];
      if (!key) continue;
      const row = rows.get(key) ?? { games: 0, wins: 0 };
      row.games += 1;
      if (seat % 2 === winningParity) row.wins += 1;
      rows.set(key, row);
    }
  }
  return [...rows.entries()]
    .map(([key, row]) => ({ key, games: row.games, rate: row.wins / Math.max(1, row.games) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

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

  // gate 1 — hard vs easy heads-up, seats swapped every other game
  const h2hRecords = simulateGames(gameDef(), games, {
    baseSeed,
    config: quickConfig(),
    tolerateStalls: true,
    maxEvents: 8_000,
    seatPoliciesFor: (index) =>
      index % 2 === 0 ? [tierBot(3), tierBot(1)] : [tierBot(1), tierBot(3)],
    seatLabelsFor: (index) => (index % 2 === 0 ? ['hard', 'easy'] : ['easy', 'hard']),
  });
  const h2hRows = aggregateWinRates(h2hRecords, recordLabel);
  const hardWinRate = h2hRows.find((row) => row.key === 'hard')?.winRate ?? 0;
  const easyWinRate = h2hRows.find((row) => row.key === 'easy')?.winRate ?? 0;
  const headToHead: HeadToHeadGate = {
    hardWinRate,
    easyWinRate,
    games,
    passes: hardWinRate >= thresholds.headToHeadMin,
  };

  // gate 2 — every persona inside a wide band on mixed four-seat tables
  const combos = personaCombos(4);
  const personaRecords = simulateGames(gameDef(), games, {
    baseSeed: baseSeed ^ 0x5eed,
    config: quickConfig(),
    tolerateStalls: true,
    maxEvents: 8_000,
    seatPoliciesFor: (index) =>
      (combos[index % combos.length] as string[]).map((id) => makePersonaBot(id)),
    seatLabelsFor: (index) => combos[index % combos.length] as string[],
  });
  const personaRows = personaRates(personaRecords).map((row) => ({
    key: row.key,
    games: row.games,
    credits: row.rate * row.games,
    winRate: row.rate,
  }));
  const failures: string[] = [];
  for (const row of personaRows) {
    if (row.winRate < thresholds.personaBandMin || row.winRate > thresholds.personaBandMax) {
      failures.push(
        `${row.key}: win share ${(row.winRate * 100).toFixed(1)}% outside band ` +
          `${(thresholds.personaBandMin * 100).toFixed(0)}–${(thresholds.personaBandMax * 100).toFixed(0)}%`,
      );
    }
  }
  const personas: PersonaGate = {
    rows: personaRows,
    failures,
    games,
    passes: failures.length === 0 && personaRows.length === PERSONAS.length,
  };

  // gate 3 — identical policies split evenly heads-up
  const symmetryGames = Math.max(8, Math.floor(games / 4));
  const symmetricRecords = simulateGames(gameDef(), symmetryGames, {
    baseSeed: baseSeed ^ 0xa11ce,
    config: quickConfig(),
    tolerateStalls: true,
    maxEvents: 8_000,
    seatPoliciesFor: () => [tierBot(2), tierBot(2)],
    seatLabelsFor: () => ['medium', 'medium'],
  });
  const share = seatParityShare(symmetricRecords, 0);
  const symmetry: SymmetryGate = {
    seatZeroShare: share,
    games: symmetryGames,
    passes:
      share !== null && share >= thresholds.symmetryBandMin && share <= thresholds.symmetryBandMax,
  };

  const stalls =
    countStalls(h2hRecords) + countStalls(personaRecords) + countStalls(symmetricRecords);
  const stallRate = stalls / Math.max(1, games * 2 + symmetryGames);

  return {
    gamesPerPhase: games,
    baseSeed,
    thresholds,
    headToHead,
    personas,
    symmetry,
    stalls,
    passed:
      headToHead.passes &&
      personas.passes &&
      symmetry.passes &&
      stallRate <= thresholds.maxStallRate,
  };
}

// ---------------------------------------------------------------------------
// Coverage sweep — every supported seat count × rule preset must finish clean
// ---------------------------------------------------------------------------

export interface CoverageRow {
  seats: number;
  preset: string;
  games: number;
  stalls: number;
  ended: number;
}

export interface CoverageReport {
  games: number;
  stalls: number;
  illegalThrows: number;
  rows: CoverageRow[];
  passed: boolean;
}

const COVERAGE_SEATS = [2, 3, 4, 6] as const;
const COVERAGE_PRESETS = ['classic', 'lungo', 'scopone-preset'] as const;

function presetConfig(preset: string) {
  return scopaConfig.resolve(scopaConfig.presets.find((p) => p.id === preset)?.values ?? {});
}

/**
 * Runs bot games across every seat count and preset, rotating tiers so each
 * seat sees different strengths. Any stall or illegal-move throw surfaces here
 * instead of hiding in an aggregate.
 */
export function runCoverage(opts: { rounds?: number; baseSeed?: number }): CoverageReport {
  const rounds = opts.rounds ?? 25;
  const baseSeed = opts.baseSeed ?? 770_011;
  const rows: CoverageRow[] = [];
  let games = 0;

  // Illegal-move throws propagate on purpose: a bot playing an illegal move or
  // a game that never ends is a bug this sweep exists to catch loudly.
  for (const seats of COVERAGE_SEATS) {
    for (const preset of COVERAGE_PRESETS) {
      // scopone is defined as the four-hander; sample it lightly elsewhere
      const count = preset === 'scopone-preset' && seats !== 4 ? Math.ceil(rounds / 3) : rounds;
      const records = simulateGames(gameDef(), count, {
        baseSeed: baseSeed + seats * 100 + preset.length,
        config: presetConfig(preset),
        tolerateStalls: true,
        maxEvents: 12_000,
        seatPoliciesFor: (index) =>
          Array.from(
            { length: seats },
            (_seat, slot) => TIER_BOTS[(index + slot) % TIER_BOTS.length]!,
          ),
      });
      games += count;
      rows.push({
        seats,
        preset,
        games: count,
        stalls: countStalls(records),
        ended: records.filter((record) => record.result).length,
      });
    }
  }

  const stalls = rows.reduce((total, row) => total + row.stalls, 0);
  return {
    games,
    stalls,
    illegalThrows: 0,
    rows,
    passed: stalls === 0 && rows.every((row) => row.ended === row.games),
  };
}
