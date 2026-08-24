import type { PokerRules } from '../config';
import { againstATable, headToHead } from './tiers';

export interface GateRow {
  name: string;
  measured: number;
  floor: number;
  passed: boolean;
}

export interface GateReport {
  rows: readonly GateRow[];
  passed: boolean;
}

export interface GateThresholds {
  /** win share for one tier-3 seat at a table of tier-1s, against 1/seats */
  hardAtATable: number;
  /** the same for tier-2 */
  mediumAtATable: number;
  /** ceiling on a tier-1 seat at a table of tier-3s */
  easyAtATable: number;
  /** heads-up floor for tier-3 against tier-1 */
  hardHeadsUp: number;
}

/**
 * Heads-up is deliberately the loosest gate here.
 *
 * Two heuristic bots playing one another with no opponent model land close to a
 * coin flip, and 120 matches only resolves a few points of edge. A four-handed
 * table separates the tiers cleanly — which is also the shape almost every solo
 * game actually takes — so that is what the tight gates are written against.
 */
export const DEFAULT_THRESHOLDS: GateThresholds = {
  hardAtATable: 0.34,
  mediumAtATable: 0.28,
  easyAtATable: 0.22,
  hardHeadsUp: 0.46,
};

export function runBalanceGates(
  options: {
    matches?: number;
    seats?: number;
    config?: Partial<PokerRules>;
    thresholds?: Partial<GateThresholds>;
  } = {},
): GateReport {
  const matches = options.matches ?? 120;
  const seats = options.seats ?? 4;
  const config = options.config ?? {};
  const limits = { ...DEFAULT_THRESHOLDS, ...options.thresholds };

  const hard = againstATable(3, 1, seats, matches, config, 40_000);
  const medium = againstATable(2, 1, seats, matches, config, 41_000);
  const easy = againstATable(1, 3, seats, matches, config, 42_000);
  const duel = headToHead(3, 1, matches, config, 20_000);

  const rows: GateRow[] = [
    {
      name: 'hard at a table of easies',
      measured: hard.rate,
      floor: limits.hardAtATable,
      passed: hard.rate >= limits.hardAtATable,
    },
    {
      name: 'medium at a table of easies',
      measured: medium.rate,
      floor: limits.mediumAtATable,
      passed: medium.rate >= limits.mediumAtATable,
    },
    // The only ceiling in the set: easy must do *worse* than an even share.
    {
      name: 'easy at a table of hards',
      measured: easy.rate,
      floor: limits.easyAtATable,
      passed: easy.rate <= limits.easyAtATable,
    },
    {
      name: 'hard heads-up against easy',
      measured: duel.rate,
      floor: limits.hardHeadsUp,
      passed: duel.rate >= limits.hardHeadsUp,
    },
  ];

  return { rows, passed: rows.every((row) => row.passed) };
}
