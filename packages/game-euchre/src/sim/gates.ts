import {
  aggregateWinRates,
  simulateGames,
  type SimulationRecord,
  type WinRateRow,
} from '@parlour/engine';
import { createEuchreDef } from '../rules';
import { makePersonaBot, PERSONAS } from '../bots/personas';
import { tierBot } from '../bots';

/**
 * Machine-checked balance gates for euchre:
 *   1. Hard partnership beats Easy partnership ≥ 60% of matches — seats swap
 *      halves every game so table position cancels out.
 *   2. No persona is degenerate: every persona's individual win credit sits
 *      inside the 30–70% band across mixed-persona matches (partners split a
 *      win, so the fair average is 50%).
 *   3. Symmetry: identical policies at every seat give team 0 a 45–55% share —
 *      guards against first-seat or team bias.
 *   4. Stall rate ≤ 0.5%.
 *
 * Pure and deterministic for a given (games, baseSeed); the CLI prints it.
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
  headToHeadMin: 0.6,
  personaBandMin: 0.3,
  personaBandMax: 0.7,
  symmetryBandMin: 0.45,
  symmetryBandMax: 0.55,
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
  teamZeroShare: number | null;
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

const gameDef = () => createEuchreDef();

/** Swap table halves every game so seat/team position cannot flatter a pair. */
function swappedHalves<T>(policies: readonly T[]): () => readonly T[] {
  return () => [policies[1]!, policies[0]!, policies[3]!, policies[2]!];
}

function alternating<T>(values: readonly T[]): (gameIndex: number) => readonly T[] {
  const flipped = [values[1]!, values[0]!, values[3]!, values[2]!];
  return (gameIndex) => (gameIndex % 2 === 0 ? values : flipped);
}

/** All four-seat combinations of the persona cast, fixed order. */
const PERSONA_COMBOS: string[][] = (() => {
  const combos: string[][] = [];
  const walk = (start: number, current: number[]) => {
    if (current.length === 4) {
      combos.push(current.map((index) => PERSONAS[index]!.id));
      return;
    }
    for (let p = start; p < PERSONAS.length; p++) walk(p + 1, [...current, p]);
  };
  walk(0, []);
  return combos;
})();

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

/**
 * Share of finished symmetric-policy matches won by team 0 (partners split a
 * win), or null when nothing finished.
 */
export function teamWinShare(records: readonly SimulationRecord[], team: 0 | 1): number | null {
  let credits = 0;
  let counted = 0;
  for (const record of records) {
    if (record.stalled || !record.result) continue;
    counted += 1;
    const winners = record.winners.filter((seat) => seat % 2 === team);
    credits += winners.length / 2;
  }
  return counted > 0 ? credits / counted : null;
}

/**
 * Per-persona rate measured as the share of finished mixed-persona matches in
 * which that persona's PARTNERSHIP won — the honest team-game analogue of a
 * win rate, whose fair average is exactly 50%.
 */
export function personaTeamRates(
  records: readonly SimulationRecord[],
): { key: string; games: number; rate: number }[] {
  const rows = new Map<string, { games: number; wins: number }>();
  for (const record of records) {
    if (record.stalled || !record.result || record.winners.length === 0) continue;
    const winningTeam = record.winners[0]! % 2;
    for (let seat = 0; seat < record.seats; seat++) {
      const key = record.labels?.[seat];
      if (!key) continue;
      const row = rows.get(key) ?? { games: 0, wins: 0 };
      row.games += 1;
      if (seat % 2 === winningTeam) row.wins += 1;
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
  const baseSeed = opts.baseSeed ?? 20260824;
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;

  // --- gate 1: Hard partnership vs Easy partnership -------------------------
  const h2hRecords = simulateGames(gameDef(), games, {
    baseSeed,
    tolerateStalls: true,
    seatPoliciesFor: alternating<ReturnType<typeof tierBot>>([tierBot(3), tierBot(1), tierBot(3), tierBot(1)]),
    seatLabelsFor: alternating<string>(['hard', 'easy', 'hard', 'easy']),
  });
  const h2hRows = aggregateWinRates(h2hRecords, recordLabel);
  const hardRow = h2hRows.find((row) => row.key === 'hard');
  const easyRow = h2hRows.find((row) => row.key === 'easy');
  const hardWinRate = hardRow?.winRate ?? 0;
  const easyWinRate = easyRow?.winRate ?? 0;
  const headToHead: HeadToHeadGate = {
    hardWinRate,
    easyWinRate,
    games,
    passes: hardWinRate >= thresholds.headToHeadMin,
  };

  // --- gate 2: mixed-persona band -------------------------------------------
  const personaRecords = simulateGames(gameDef(), games, {
    baseSeed: baseSeed ^ 0x5eed,
    tolerateStalls: true,
    seatPoliciesFor: (index) =>
      (PERSONA_COMBOS[index % PERSONA_COMBOS.length] as string[]).map((id) => makePersonaBot(id)),
    seatLabelsFor: (index) => PERSONA_COMBOS[index % PERSONA_COMBOS.length] as string[],
  });
  const personaRows = personaTeamRates(personaRecords).map((row) => ({
    key: row.key,
    games: row.games,
    credits: row.rate * row.games,
    winRate: row.rate,
  }));
  const failures: string[] = [];
  for (const row of personaRows) {
    if (row.winRate < thresholds.personaBandMin || row.winRate > thresholds.personaBandMax) {
      failures.push(
        `${row.key}: win credit ${(row.winRate * 100).toFixed(1)}% outside band ` +
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

  // --- gate 3: identical-policy symmetry ------------------------------------
  const symmetryGames = Math.max(10, Math.floor(games / 4));
  const symmetricRecords = simulateGames(gameDef(), symmetryGames, {
    baseSeed: baseSeed ^ 0xa11ce,
    tolerateStalls: true,
    seatPoliciesFor: swappedHalves([tierBot(2), tierBot(2), tierBot(2), tierBot(2)]),
    seatLabelsFor: () => ['medium', 'medium', 'medium', 'medium'],
  });
  const share = teamWinShare(symmetricRecords, 0);
  const symmetryPasses =
    share !== null && share >= thresholds.symmetryBandMin && share <= thresholds.symmetryBandMax;
  const symmetry: SymmetryGate = { teamZeroShare: share, games: symmetryGames, passes: symmetryPasses };

  const stalls = countStalls(h2hRecords) + countStalls(personaRecords) + countStalls(symmetricRecords);
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
