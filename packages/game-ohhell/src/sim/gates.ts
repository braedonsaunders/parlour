import {
  aggregateWinRates,
  runBotGame,
  simulateGames,
  BotGameStalledError,
  type SimulationRecord,
  type WinRateRow,
} from '@parlour/engine';
import { PERSONAS, makePersonaBot } from '../bots/personas';
import { tierBot } from '../bots';
import { createOhHellDef } from '../game';
import { ohhellConfig } from '../config';

/**
 * Machine-checked balance gates for Oh Hell (individuals, no teams — a fair
 * share on a four-seat table is 25%, not 50%):
 *   1. Hard seats out-win Easy seats decisively (seats swap halves).
 *   2. Every persona lands inside a wide band around the 25% fair share.
 *   3. Four identical policies give every SEAT POSITION a similar share.
 *   4. Stall rate ≤ 0.5%.
 */

export interface GateThresholds {
  /** minimum combined win share for the two Hard seats (fair-share 0.25 each) */
  headToHeadMin: number;
  personaBandMin: number;
  personaBandMax: number;
  /** max spread between best and worst seat position under identical policies */
  symmetryMaxSpread: number;
  maxStallRate: number;
}

export const DEFAULT_THRESHOLDS: GateThresholds = {
  headToHeadMin: 0.31,
  personaBandMin: 0.12,
  personaBandMax: 0.38,
  symmetryMaxSpread: 0.24,
  maxStallRate: 0.005,
};

export interface HeadToHeadGate {
  hardWinShare: number;
  easyWinShare: number;
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
  shares: readonly number[];
  spread: number | null;
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

const gameDef = () => createOhHellDef();
const gateConfig = () => ohhellConfig.resolve({});

/**
 * Symmetry, with the dealer rotating exactly as a real match rotates it.
 *
 * `simulateGames` takes one config for the whole batch, which for this game
 * means one fixed dealer for every simulated round — and a fixed dealer is not
 * a fair test. Oh Hell is *deliberately* positional inside a single round: the
 * dealer bids last with the most information but wears the hook rule, and the
 * first bidder commits knowing nothing. Holding the dealer still and then
 * asking whether the seats are even measures that designed advantage and calls
 * it a balance bug — it reported a 34-point spread on a game that was working.
 *
 * A match rotates the dealer every round (see `roundConfig` in match.ts), so
 * the gate does too. What is left after rotation is genuine asymmetry, which is
 * the thing worth failing on.
 */
function simulateSymmetry(games: number, baseSeed: number): SimulationRecord[] {
  const records: SimulationRecord[] = [];
  const policies = [tierBot(2), tierBot(2), tierBot(2), tierBot(2)];
  for (let index = 0; index < games; index++) {
    const seed = (baseSeed + index) | 0;
    const config = ohhellConfig.resolve({ dealer: index % 4 });
    try {
      const record = runBotGame(gameDef(), { seed, config, policies, maxEvents: 8_000 });
      const winners = (record.result?.rankings ?? [])
        .filter((ranking) => ranking.rank === 1)
        .map((ranking) => ranking.seat);
      records.push({ ...record, winners });
    } catch (error) {
      if (!(error instanceof BotGameStalledError)) throw error;
      records.push({ seed, seats: 4, events: 8_000, result: null, winners: [], stalled: true });
    }
  }
  return records;
}

function alternating<T>(values: readonly T[]): (gameIndex: number) => readonly T[] {
  const flipped = [values[1]!, values[0]!, values[3]!, values[2]!];
  return (gameIndex) => (gameIndex % 2 === 0 ? values : flipped);
}

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

/** Fractional win credit for one seat position (tied winners split the game). */
export function seatWinShare(records: readonly SimulationRecord[], seat: number): number {
  let credits = 0;
  let counted = 0;
  for (const record of records) {
    if (record.stalled || !record.result) continue;
    counted += 1;
    if (record.winners.includes(seat)) credits += 1 / Math.max(1, record.winners.length);
  }
  return counted > 0 ? credits / counted : 0;
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

  const h2hRecords = simulateGames(gameDef(), games, {
    baseSeed,
    config: gateConfig(),
    tolerateStalls: true,
    maxEvents: 8_000,
    seatPoliciesFor: alternating([tierBot(3), tierBot(1), tierBot(3), tierBot(1)]),
    seatLabelsFor: alternating(['hard', 'easy', 'hard', 'easy']),
  });
  const h2hRows = aggregateWinRates(h2hRecords, recordLabel);
  const hardWinShare = h2hRows.find((row) => row.key === 'hard')?.winRate ?? 0;
  const easyWinShare = h2hRows.find((row) => row.key === 'easy')?.winRate ?? 0;
  const headToHead: HeadToHeadGate = {
    hardWinShare,
    easyWinShare,
    games,
    passes: hardWinShare >= thresholds.headToHeadMin,
  };

  const personaRecords = simulateGames(gameDef(), games, {
    baseSeed: baseSeed ^ 0x5eed,
    config: gateConfig(),
    tolerateStalls: true,
    maxEvents: 8_000,
    seatPoliciesFor: (index) =>
      (PERSONA_COMBOS[index % PERSONA_COMBOS.length] as string[]).map((id) => makePersonaBot(id)),
    seatLabelsFor: (index) => PERSONA_COMBOS[index % PERSONA_COMBOS.length] as string[],
  });
  const personaRows = aggregateWinRates(personaRecords, recordLabel);
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

  const symmetryRecords = simulateSymmetry(Math.max(8, Math.floor(games / 4)), baseSeed ^ 0xa11ce);
  const shares = [0, 1, 2, 3].map((seat) => seatWinShare(symmetryRecords, seat));
  const spread = Math.max(...shares) - Math.min(...shares);
  const symmetry: SymmetryGate = {
    shares,
    spread,
    games: symmetryRecords.length,
    passes: spread <= thresholds.symmetryMaxSpread,
  };

  const stalls =
    countStalls(h2hRecords) + countStalls(personaRecords) + countStalls(symmetryRecords);

  return {
    gamesPerPhase: games,
    baseSeed,
    thresholds,
    headToHead,
    personas,
    symmetry,
    stalls,
    passed: headToHead.passes && personas.passes && symmetry.passes && stalls === 0,
  };
}
