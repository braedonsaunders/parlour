import {
  aggregateWinRates,
  simulateGames,
  type SimulationRecord,
  type WinRateRow,
} from '@parlour/engine';
import { createCribbageDef } from '../rules';
import { PERSONAS, makePersonaBot } from '../bots/personas';
import { tierBot } from '../bots';

/**
 * Balance gates, machine-checked (mirrors Blitz's spec §9 shape, adapted to
 * two-seat cribbage):
 *   1. Hard beats Easy ≥ 70 % head-to-head (seats alternate every game).
 *   2. No persona is degenerate in mixed round-robin play — every persona
 *      stays inside the 12–88 % band. The house cast deliberately spans all
 *      three tiers, so the band targets degeneracy (a persona that never or
 *      always wins), not parity.
 *   3. Tier ordering holds: the weakest sharp persona outwins the strongest
 *      rookie across the round robin.
 *
 * Pure and deterministic for a given (games, baseSeed); the CLI is a printer
 * over this module.
 */

export interface GateThresholds {
  headToHeadMin: number;
  personaBandMin: number;
  personaBandMax: number;
  maxStallRate: number;
}

export const DEFAULT_THRESHOLDS: GateThresholds = {
  headToHeadMin: 0.7,
  personaBandMin: 0.12,
  personaBandMax: 0.88,
  maxStallRate: 0,
};

export interface GateReport {
  gamesPerPhase: number;
  baseSeed: number;
  thresholds: GateThresholds;
  headToHead: { hardWinRate: number; easyWinRate: number; games: number; passes: boolean };
  personas: {
    rows: WinRateRow[];
    failures: string[];
    /** weakest sharp persona beats the strongest rookie */
    tierOrdering: { sharpest: number; rookie: number; passes: boolean };
    games: number;
    passes: boolean;
  };
  stalls: number;
  passed: boolean;
}

/** every unordered pair of personas, seats alternating across cycles */
const PAIRS: readonly (readonly [number, number])[] = (() => {
  const pairs: [number, number][] = [];
  for (let a = 0; a < PERSONAS.length; a++) {
    for (let b = a + 1; b < PERSONAS.length; b++) {
      pairs.push([a, b], [b, a]);
    }
  }
  return pairs;
})();

/** deterministic round-robin pairing of personas over 2-seat games */
function personaPairing(index: number): readonly [number, number] {
  return PAIRS[index % PAIRS.length] as readonly [number, number];
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
  const def = createCribbageDef();

  // --- gate 1: Hard vs Easy, seats alternating -----------------------------
  const h2hRecords = simulateGames(def, games, {
    baseSeed,
    tolerateStalls: true,
    seatPoliciesFor: (index) =>
      index % 2 === 0 ? [tierBot(3), tierBot(1)] : [tierBot(1), tierBot(3)],
    seatLabelsFor: (index) => (index % 2 === 0 ? ['hard', 'easy'] : ['easy', 'hard']),
  });
  const h2hRows = aggregateWinRates(h2hRecords, recordLabel);
  const hardWinRate = h2hRows.find((row) => row.key === 'hard')?.winRate ?? 0;
  const easyWinRate = h2hRows.find((row) => row.key === 'easy')?.winRate ?? 0;

  // --- gate 2: persona round-robin band ------------------------------------
  const personaRecords = simulateGames(def, games, {
    baseSeed: baseSeed ^ 0x51eed,
    tolerateStalls: true,
    seatPoliciesFor: (index) => pairPolicies(index),
    seatLabelsFor: (index) => pairLabels(index),
  });
  const personaRows = aggregateWinRates(personaRecords, recordLabel);

  return assemble(
    thresholds,
    games,
    baseSeed,
    h2hRecords,
    personaRecords,
    hardWinRate,
    easyWinRate,
    personaRows,
  );

  function pairPolicies(index: number) {
    const [a, b] = personaPairing(index);
    return [makePersonaBot(PERSONAS[a]!.id), makePersonaBot(PERSONAS[b]!.id)];
  }
  function pairLabels(index: number): string[] {
    const [a, b] = personaPairing(index);
    return [PERSONAS[a]!.id, PERSONAS[b]!.id];
  }
}

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
  hardWinRate: number,
  easyWinRate: number,
  personaRows: WinRateRow[],
): GateReport {
  const stallCount = [...h2hRecords, ...personaRecords].filter((record) => record.stalled).length;

  const headToHead = {
    hardWinRate,
    easyWinRate,
    games,
    passes: hardWinRate >= thresholds.headToHeadMin,
  };

  const failures: string[] = [];
  for (const row of personaRows) {
    if (row.winRate < thresholds.personaBandMin || row.winRate > thresholds.personaBandMax) {
      failures.push(
        `${row.key}: win rate ${(row.winRate * 100).toFixed(1)}% outside band ${(
          thresholds.personaBandMin * 100
        ).toFixed(0)}–${(thresholds.personaBandMax * 100).toFixed(0)}%`,
      );
    }
  }
  const ratesOfTier = (tier: 1 | 2 | 3) =>
    PERSONAS.filter((persona) => persona.tier === tier).map(
      (persona) => personaRows.find((row) => row.key === persona.id)?.winRate ?? 0,
    );
  const sharpest = Math.min(...ratesOfTier(3));
  const rookie = Math.max(...ratesOfTier(1));
  const tierOrdering = { sharpest, rookie, passes: sharpest > rookie };

  const personas = {
    rows: personaRows,
    failures,
    tierOrdering,
    games,
    passes: failures.length === 0 && tierOrdering.passes && personaRows.length === PERSONAS.length,
  };

  const passed =
    headToHead.passes &&
    personas.passes &&
    stallCount / Math.max(1, 2 * games) <= thresholds.maxStallRate;

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
