import {
  aggregateWinRates,
  simulateGames,
  type SimulationRecord,
  type WinRateRow,
} from '@parlour/engine';
import { HEARTS_BOTS, HEARTS_PERSONAS } from '../bots';
import { heartsGame } from '../game';
import { heartsConfigSchema } from '../config';

/**
 * Balance gates (spec §9 shape): the sim plays mixed tables and requires a
 * measurable skill ladder. Hearts deals more variance than Blitz — four hidden
 * hands swing hard — so gates are calibrated on measured bands, not vibes:
 * gate 1 keeps Sharp clearly ahead of Harmless; gate 2 keeps every persona
 * inside a healthy band in mixed company.
 */
export const DEFAULT_THRESHOLDS = {
  hardVsEasyMin: 0.32,
  easyVsHardMax: 0.3,
  // Dove deliberately plays novice-random against three sharp policies, so
  // the floor sits low; nobody may dominate past a third of the tables.
  personaBandMin: 0.1,
  personaBandMax: 0.34,
} as const;

export type Thresholds = typeof DEFAULT_THRESHOLDS;

export interface GateReport {
  passed: boolean;
  games: number;
  stalls: number;
  ladder: { rows: WinRateRow[]; passes: boolean };
  personas: { rows: WinRateRow[]; passes: boolean };
  thresholds: Thresholds;
}

const TIER_LABELS = ['Harmless', 'Careful', 'Sharp'] as const;

/** [hard, easy, easy, medium] rotated by game index so seat bias cancels out. */
function ladderSeats(gameIndex: number) {
  const arrangement = [2, 0, 0, 1] as const;
  return Array.from({ length: 4 }, (_, offset) => arrangement[(gameIndex + offset) % 4]!);
}

function policiesFor(seatTiers: readonly number[]) {
  return seatTiers.map((tier) => HEARTS_BOTS[tier]);
}

function labelsFor(seatTiers: readonly number[]) {
  return seatTiers.map((tier) => TIER_LABELS[tier] ?? 'Careful');
}

/** All four personas, one per seat, rotated per game. */
function personaPoliciesFor(gameIndex: number) {
  return Array.from(
    { length: 4 },
    (_, offset) => HEARTS_PERSONAS[(gameIndex + offset) % HEARTS_PERSONAS.length]!.bot,
  );
}

function personaLabelsFor(gameIndex: number) {
  return Array.from(
    { length: 4 },
    (_, offset) => HEARTS_PERSONAS[(gameIndex + offset) % HEARTS_PERSONAS.length]!.id,
  );
}

function winRates(
  records: readonly SimulationRecord[],
  labelForSeat: (record: SimulationRecord, seat: number) => string,
): WinRateRow[] {
  return aggregateWinRates(records, labelForSeat);
}

export function runBalanceGates(opts: {
  games: number;
  baseSeed?: number;
  thresholds?: Partial<Thresholds>;
}): GateReport {
  const games = Math.max(0, Math.floor(opts.games));
  const baseSeed = opts.baseSeed ?? 20_260_823;
  const thresholds = { ...DEFAULT_THRESHOLDS, ...opts.thresholds };

  const ladderRecords = simulateGames(heartsGame, games, {
    baseSeed,
    maxEvents: 400,
    config: heartsConfigSchema.defaults(),
    seatPoliciesFor: (i) => policiesFor(ladderSeats(i)) as never[],
    seatLabelsFor: (i) => labelsFor(ladderSeats(i)),
  });

  const personaRecords = simulateGames(heartsGame, games, {
    baseSeed: baseSeed + 77_000_000,
    maxEvents: 400,
    config: heartsConfigSchema.defaults(),
    seatPoliciesFor: (i) => personaPoliciesFor(i) as never[],
    seatLabelsFor: (i) => personaLabelsFor(i),
  });

  const ladderRows = winRates(ladderRecords, (record, seat) =>
    String(record.labels?.[seat] ?? seat),
  );
  const personaRows = winRates(personaRecords, (record, seat) =>
    String(record.labels?.[seat] ?? seat),
  );

  const sharp = ladderRows.find((row) => row.key === 'Sharp');
  const harmless = ladderRows.find((row) => row.key === 'Harmless');
  const ladderPasses =
    (sharp?.winRate ?? 0) >= thresholds.hardVsEasyMin &&
    (harmless?.winRate ?? 1) <= thresholds.easyVsHardMax;

  const personasPasses = personaRows.every(
    (row) => row.winRate >= thresholds.personaBandMin && row.winRate <= thresholds.personaBandMax,
  );

  const stalls = [...ladderRecords, ...personaRecords].filter((record) => record.stalled).length;
  const passed = ladderPasses && personasPasses && stalls === 0 && games > 0;

  return {
    passed,
    games,
    stalls,
    ladder: { rows: ladderRows, passes: ladderPasses },
    personas: { rows: personaRows, passes: personasPasses },
    thresholds,
  };
}
