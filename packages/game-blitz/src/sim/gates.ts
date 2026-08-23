import {
  aggregateWinRates,
  simulateGames,
  type SimulationRecord,
  type WinRateRow,
} from '@parlour/engine';
import { createBlitzDef } from '../rules';
import { PERSONAS, makePersonaBot } from '../bots/personas';
import { tierBot } from '../bots';

/**
 * Balance gates from spec §9, machine-checked:
 *   1. Hard beats Easy ≥ 70% head-to-head (seats alternate every game).
 *   2. No persona is degenerate: every persona's win rate sits inside the
 *      15–35% band across 4-seat mixed-persona games.
 *
 * Pure and deterministic for a given (games, baseSeed) — the CLI is a thin
 * printer over this module.
 */

export interface GateThresholds {
  headToHeadMin: number;
  personaBandMin: number;
  personaBandMax: number;
  /** fraction of abandoned games tolerated before the run fails outright */
  maxStallRate: number;
}

export const DEFAULT_THRESHOLDS: GateThresholds = {
  headToHeadMin: 0.7,
  personaBandMin: 0.15,
  personaBandMax: 0.35,
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

export interface GateReport {
  gamesPerPhase: number;
  baseSeed: number;
  thresholds: GateThresholds;
  headToHead: HeadToHeadGate;
  personas: PersonaGate;
  stalls: number;
  passed: boolean;
}

/** all ordered seat assignments of 4 personas out of the 6, fixed order */
function personaCombos(): number[][] {
  const combos: number[][] = [];
  const n = PERSONAS.length;
  const seats = 4;
  const current: number[] = [];
  const walk = (start: number) => {
    if (current.length === seats) {
      combos.push(current.slice());
      return;
    }
    for (let p = start; p < n; p++) {
      current.push(p);
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
  const baseSeed = opts.baseSeed ?? 20260823;
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const def = createBlitzDef();

  // --- gate 1: Hard vs Easy, seats alternating ----------------------------
  const h2hRecords = simulateGames(def, games, {
    baseSeed,
    tolerateStalls: true,
    seatPoliciesFor: () => [tierBot(3), tierBot(1)],
    seatLabelsFor: () => ['hard', 'easy'],
  });
  const h2hRows = aggregateWinRates(h2hRecords, recordLabel);
  const hardRow = h2hRows.find((r) => r.key === 'hard');
  const easyRow = h2hRows.find((r) => r.key === 'easy');

  // --- gate 2: mixed-persona band -----------------------------------------
  const personaRecords = simulateGames(def, games, {
    baseSeed: baseSeed ^ 0x5eed,
    tolerateStalls: true,
    seatPoliciesFor: (i) => comboPolicies(i),
    seatLabelsFor: (i) => comboLabels(i),
  });
  const personaRows = aggregateWinRates(personaRecords, recordLabel);

  return assemble(
    thresholds,
    games,
    baseSeed,
    h2hRecords,
    personaRecords,
    hardRow,
    easyRow,
    personaRows,
  );

  function comboPolicies(index: number): (BotPolicyLike | undefined)[] {
    const combo = COMBOS[index % COMBOS.length] as number[];
    return combo.map((personaIndex) => makePersonaBot(PERSONAS[personaIndex]!.id));
  }
  function comboLabels(index: number): string[] {
    const combo = COMBOS[index % COMBOS.length] as number[];
    return combo.map((p) => PERSONAS[p]!.id);
  }
}

type BotPolicyLike = ReturnType<typeof makePersonaBot>;

function recordLabel(record: SimulationRecord, seat: number): string {
  const label = record.labels?.[seat];
  if (!label) throw new Error('simulation record is missing a seat label');
  return label;
}

function assemble(
  thresholds: GateThresholds,
  games: number,
  baseSeed: number,
  h2hRecords: readonly SimulationRecord[],
  personaRecords: readonly SimulationRecord[],
  hardRow: WinRateRow | undefined,
  easyRow: WinRateRow | undefined,
  personaRows: WinRateRow[],
): GateReport {
  const stallCount = countStalls(h2hRecords) + countStalls(personaRecords);

  const hardWinRate = hardRow?.winRate ?? 0;
  const easyWinRate = easyRow?.winRate ?? 0;
  const headToHead: HeadToHeadGate = {
    hardWinRate,
    easyWinRate,
    games,
    passes: hardWinRate >= thresholds.headToHeadMin,
  };

  const failures: string[] = [];
  for (const row of personaRows) {
    if (row.winRate < thresholds.personaBandMin || row.winRate > thresholds.personaBandMax) {
      failures.push(
        `${row.key}: win rate ${pct(row.winRate)} outside band ${pct(thresholds.personaBandMin)}–${pct(thresholds.personaBandMax)}`,
      );
    }
  }
  const personas: PersonaGate = {
    rows: personaRows,
    failures,
    games,
    passes: failures.length === 0 && personaRows.length === PERSONAS.length,
  };

  const stallRate = stallCount / Math.max(1, 2 * games);
  const passed = headToHead.passes && personas.passes && stallRate <= thresholds.maxStallRate;

  return {
    gamesPerPhase: games,
    baseSeed,
    thresholds,
    headToHead,
    personas,
    stalls: stallCount,
    passed,
  };
}

function countStalls(records: readonly SimulationRecord[]): number {
  let count = 0;
  for (const record of records) if (record.stalled) count += 1;
  return count;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
