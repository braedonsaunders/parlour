import {
  RATSCREW_PERSONAS,
  PERSONA_BY_TIER,
  replaysIdentically,
  simulateRealtimeGame,
} from '../realtime';

/**
 * Balance gates for the real-time persona field (spec §9 adapted to slap
 * races): the fast tier must beat the slow tier head-to-head, no persona may
 * run away with (or drown in) a mixed table, and every sampled match must
 * replay hash-identically.
 */

export interface GateThresholds {
  headToHeadMin: number;
  personaBandMin: number;
  personaBandMax: number;
}

/**
 * Adapted from the spec §9 strategy bands for a reflex game: speed dominates
 * pile races by design, so the ceiling is generous — the gates exist to catch
 * DEGENERATE personas (runaway winners / permanent losers), not equal shares.
 * Measured spread over 250-game seed blocks: rusty ≈9–12 %, quinn ≈16–18 %,
 * bolt ≈50–56 %, jinx ≈16–21 %.
 */
export const DEFAULT_THRESHOLDS: GateThresholds = {
  headToHeadMin: 0.54,
  personaBandMin: 0.08,
  personaBandMax: 0.6,
};

export interface WinRateRow {
  key: string;
  games: number;
  credits: number;
  winRate: number;
}

export interface GateReport {
  games: number;
  headToHead: { hardWinRate: number; easyWinRate: number; games: number; passes: boolean };
  personas: { rows: WinRateRow[]; passes: boolean };
  determinism: { samples: number; passes: boolean };
  stalls: number;
  avgEvents: number;
  thresholds: GateThresholds;
  passed: boolean;
}

interface Tally {
  games: number;
  credits: number;
}

function tally(
  records: readonly { seats: number; winners: readonly number[]; labels: readonly string[] }[],
): Map<string, Tally> {
  const rows = new Map<string, Tally>();
  for (const record of records) {
    for (let seat = 0; seat < record.seats; seat++) {
      const key = record.labels[seat] ?? `seat ${seat}`;
      const row = rows.get(key) ?? { games: 0, credits: 0 };
      if (record.winners.includes(seat)) row.credits += 1 / Math.max(1, record.winners.length);
      row.games += 1;
      rows.set(key, row);
    }
  }
  return rows;
}

function rates(rows: Map<string, Tally>): WinRateRow[] {
  return [...rows.entries()]
    .map(([key, row]) => ({
      key,
      games: row.games,
      credits: row.credits,
      winRate: row.games > 0 ? row.credits / row.games : 0,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Rotating seat orders so nobody owns the deal advantage. */
function mixedLineup(gameIndex: number): readonly string[] {
  const rotation = gameIndex % 4;
  const names = ['rusty', 'quinn', 'bolt', 'jinx'];
  return Array.from({ length: 4 }, (_, seat) => names[(seat + rotation) % 4]!);
}

export function personaFor(id: string) {
  const persona = Object.values(RATSCREW_PERSONAS).find((candidate) => candidate.id === id);
  if (!persona) throw new Error(`unknown ratscrew persona: ${id}`);
  return persona;
}

export function runBalanceGates(opts: {
  games: number;
  baseSeed?: number;
  thresholds?: Partial<GateThresholds>;
}): GateReport {
  const baseSeed = opts.baseSeed ?? 20260823;
  const games = opts.games;
  const thresholds = { ...DEFAULT_THRESHOLDS, ...opts.thresholds };

  // gate 1 — hard vs easy head-to-head, alternating seats
  const duel = { hard: 0, easy: 0 };
  let duelGames = 0;
  for (let i = 0; i < games; i++) {
    const hardFirst = i % 2 === 0;
    const record = simulateRealtimeGame({
      seed: baseSeed + i * 2 + (hardFirst ? 0 : 1),
      seats: 2,
      personas: hardFirst
        ? [personaFor('bolt'), personaFor('rusty')]
        : [personaFor('rusty'), personaFor('bolt')],
    });
    if (record.stalled) continue;
    duelGames += 1;
    if (record.winners.includes(0)) {
      if (hardFirst) duel.hard += 1;
      else duel.easy += 1;
    } else if (record.winners.includes(1)) {
      if (hardFirst) duel.easy += 1;
      else duel.hard += 1;
    }
  }
  const hardWinRate = duelGames > 0 ? duel.hard / duelGames : 0;
  const easyWinRate = duelGames > 0 ? duel.easy / duelGames : 0;
  const headToHead = {
    hardWinRate,
    easyWinRate,
    games: duelGames,
    passes: hardWinRate >= thresholds.headToHeadMin,
  };

  // gate 2 — mixed four-seat band
  const mixed = [];
  for (let i = 0; i < games; i++) {
    mixed.push(
      simulateRealtimeGame({
        seed: baseSeed + 10_000 + i,
        seats: 4,
        personas: mixedLineup(i).map(personaFor),
      }),
    );
  }
  const rows = rates(tally(mixed));
  const personasPasses = rows.every(
    (row) => row.winRate >= thresholds.personaBandMin && row.winRate <= thresholds.personaBandMax,
  );

  // gate 3 — seeded determinism on a small sample
  const samples = Math.min(4, Math.max(1, games));
  let deterministic = true;
  for (let i = 0; i < samples; i++) {
    const seed = baseSeed + 20_000 + i;
    const first = simulateRealtimeGame({
      seed,
      seats: 3,
      personas: [personaFor('bolt'), personaFor('quinn'), personaFor('rusty')],
    });
    const second = simulateRealtimeGame({
      seed,
      seats: 3,
      personas: [personaFor('bolt'), personaFor('quinn'), personaFor('rusty')],
    });
    if (first.finalHash !== second.finalHash || !replaysIdentically(first)) deterministic = false;
  }

  const all = [...mixed];
  const stalls = all.filter((record) => record.stalled).length;
  const avgEvents =
    all.length > 0 ? all.reduce((sum, record) => sum + record.events, 0) / all.length : 0;

  return {
    games,
    headToHead,
    personas: { rows, passes: personasPasses },
    determinism: { samples, passes: deterministic },
    stalls,
    avgEvents,
    thresholds,
    passed: headToHead.passes && personasPasses && deterministic && stalls === 0,
  };
}

export { PERSONA_BY_TIER };
