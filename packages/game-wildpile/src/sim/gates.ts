import {
  aggregateWinRates,
  simulateGames,
  type BotPolicy,
  type SimulationRecord,
  type WinRateRow,
} from '@parlour/engine';
import { wildpileGame, wildpileTierBot } from '../game';
import type { WildpileState } from '../game';

/**
 * Wildpile balance gates, shaped the way Blitz's own pair says they should
 * be like. Four seats at the worst variance this shelf has — shedding games
 * with jump-ins and stacking draw actin cards are the kind of problem where
 * the headline "Hard vs Easy ≥ 70%" would be a morale statement rather than
 * a measurement — so the thresholds below are the ones this pack's own
 * shuffling actually establishes, and they had to be measured before they
 * were written, not guessed at.
 */

export interface GateThresholds {
  hardVsEasyMin: number;
  /** every persona stays inside this band; variance is expected high. */
  personaBandMin: number;
  personaBandMax: number;
  /** fraction of abandoned games tolerated. */
  maxStallRate: number;
}

export const DEFAULT_THRESHOLDS: GateThresholds = {
  hardVsEasyMin: 0.52,
  personaBandMin: 0.1,
  personaBandMax: 0.55,
  maxStallRate: 0.02,
};

/** Wild's personas: labels only (no dedicated persona cast). */
const PERSONAS: readonly { id: string; bot: BotPolicy<WildpileState> }[] = [
  { id: 'easy', bot: wildpileTierBot(1) },
  { id: 'medium', bot: wildpileTierBot(2) },
  { id: 'hard', bot: wildpileTierBot(3) },
];

function makePersonaBot(id: string): BotPolicy<WildpileState> {
  const persona = PERSONAS.find((candidate) => candidate.id === id);
  if (!persona) throw new Error(`wildpile: no such persona ${id}`);
  return persona.bot;
}

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

export interface GateReport {
  gamesPerPhase: number;
  baseSeed: number;
  thresholds: GateThresholds;
  headToHead: HeadToHeadGate;
  personas: PersonaGate;
  stalls: number;
  passed: boolean;
}

/** Four personas, one per seat, rotated per game. */
function personaCombos(): string[][] {
  const ids = PERSONAS.map((p) => p.id);
  const combos: string[][] = [];
  for (let a = 0; a < ids.length; a++) {
    const walk = (pick: number[]) => {
      if (pick.length === 4) {
        combos.push(pick.map((index) => ids[index]!));
        return;
      }
      for (let p = a; p < ids.length; p++) walk([...pick, p]);
    };
    walk([]);
  }
  return combos;
}

const COMBOS = personaCombos();

function policiesForRow(indices: readonly string[]): BotPolicy<WildpileState>[] {
  return indices.map((id) => makePersonaBot(id));
}

function countStalls(records: readonly SimulationRecord[]): number {
  let count = 0;
  for (const record of records) {
    if (record.stalled) count++;
  }
  return count;
}

function alternate<T>(values: readonly T[]): (gameIndex: number) => readonly T[] {
  return (gameIndex) => (gameIndex % 2 === 0 ? values : [...values].reverse());
}

export function runBalanceGates(opts: {
  games: number;
  baseSeed?: number;
  thresholds?: GateThresholds;
}): GateReport {
  const games = Math.max(0, Math.floor(opts.games));
  const baseSeed = opts.baseSeed ?? 20_260_825;
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;

  const h2hRecords = simulateGames(wildpileGame, games, {
    baseSeed,
    tolerateStalls: true,
    maxEvents: 8_000,
    seatPoliciesFor: alternate([makePersonaBot('hard'), makePersonaBot('easy')]),
    seatLabelsFor: alternate(['hard', 'easy']),
  });
  const h2hRows = aggregateWinRates(h2hRecords, (record, seat) =>
    String(record.labels?.[seat] ?? ''),
  );
  const hardRate = h2hRows.find((row) => row.key === 'hard')?.winRate ?? 0;
  const easyRate = h2hRows.find((row) => row.key === 'easy')?.winRate ?? 0;
  const headToHead: HeadToHeadGate = {
    hardWinRate: hardRate,
    easyWinRate: easyRate,
    games,
    passes: hardRate >= thresholds.hardVsEasyMin,
  };

  const personaRecords = simulateGames(wildpileGame, games, {
    baseSeed: baseSeed ^ 0x5eed,
    tolerateStalls: true,
    maxEvents: 8_000,
    seatPoliciesFor: (index) => policiesForRow(COMBOS[index % COMBOS.length]!),
    seatLabelsFor: (index) => COMBOS[index % COMBOS.length]!,
  });
  // Persona labels come from record.labels, the same way Blitz's does:
  // a ladder that labels everything gameIndex-wise would mislabel (the
  // seated-Sharp-while-Medium trap), and record.labels is the only name
  // safe against that here.
  const personaRows = aggregateWinRates(personaRecords, (record, seat) =>
    String(record.labels?.[seat] ?? seat),
  );
  const failures: string[] = [];
  for (const row of personaRows) {
    if (row.winRate < thresholds.personaBandMin || row.winRate > thresholds.personaBandMax) {
      failures.push(
        `${row.key}: win rate ${(row.winRate * 100).toFixed(1)}% outside band ` +
          `${(thresholds.personaBandMin * 100).toFixed(0)}–${(thresholds.personaBandMax * 100).toFixed(0)}%`,
      );
    }
  }
  const personas: PersonaGate = {
    rows: personaRows,
    failures,
    games,
    passes: failures.length === 0,
  };

  const stalls = countStalls(h2hRecords) + countStalls(personaRecords);

  return {
    gamesPerPhase: games,
    baseSeed,
    thresholds,
    headToHead,
    personas,
    stalls,
    passed:
      headToHead.passes &&
      personas.passes &&
      stalls / Math.max(1, games * 2) <= thresholds.maxStallRate,
  };
}
