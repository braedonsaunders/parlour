import { describe, expect, it } from 'vitest';
import {
  aggregateWinRates,
  chooseBotMove,
  enumerateLegalMoves,
  runBotGame,
  simulateGames,
} from './bots';
import { defineConfig } from './config';
import { makeRng } from './rng';
import { createSession } from './runtime';
import type { BotPolicy, GameDef, LegalMove, RuleValues, SeatId } from './types';

// --- fixture: a race to N points -------------------------------------------

interface RaceRules extends RuleValues {
  goal: number;
}

interface RaceState {
  seats: number;
  scores: number[];
  turn: SeatId;
}

const schema = defineConfig<RaceRules>([
  { key: 'goal', kind: 'int', label: 'Goal', min: 1, max: 50, default: 5 },
]);

const raceMove = (gain: number) => ({
  validate: () => true as const,
  apply(state: RaceState, seat: SeatId) {
    const scores = state.scores.map((s, i) => (i === seat ? s + gain : s));
    return { ...state, scores, turn: (seat + 1) % state.seats };
  },
});

const raceOver = (state: RaceState) => {
  const best = Math.max(...state.scores);
  if (best < 5 || state.scores.filter((s) => s === best).length !== 1) return null;
  const winner = state.scores.indexOf(best);
  return { winner, rankings: [{ seat: winner, rank: 1 }], reason: 'goal-reached' as const };
};

const raceGame: GameDef<RaceState, RaceRules> = {
  id: 'race',
  configSchema: schema,
  setup: ({ seats }) => ({ seats, scores: Array.from({ length: seats }, () => 0), turn: 0 }),
  moves: { take1: raceMove(1), take2: raceMove(2), take0: raceMove(0) },
  flow: {
    start: (state) => ({ phase: 'race', actor: state.turn, round: 1 }),
    legalMoves: (_state, phase) =>
      phase.actor === null ? [] : [{ id: 'take0' }, { id: 'take1' }, { id: 'take2' }],
    advance: (state) => {
      const ended = raceOver(state);
      if (ended) {
        return { phase: { phase: 'over', actor: null, round: 1 }, ended };
      }
      return { phase: { phase: 'race', actor: state.turn, round: 1 } };
    },
  },
  playerView: (state) => state,
  end: raceOver,
  bots: [],
};

type Gain = 0 | 1 | 2;

const scriptedPolicy = (id: string, gains: readonly Gain[]): BotPolicy<RaceState> => {
  let at = 0;
  return {
    id,
    label: id,
    tier: 1,
    chooseMove(_view, _seat, legal) {
      const gain = gains[at % gains.length] as Gain;
      at += 1;
      void _view;
      void _seat;
      return legal.find((m) => m.id === `take${gain}`) as LegalMove;
    },
  };
};

const greedyPolicy = (id: string): BotPolicy<RaceState> => ({
  id,
  label: id,
  tier: 3,
  chooseMove: (_view, _seat, legal) => legal.find((m) => m.id === 'take2') as LegalMove,
});

const POLICIES = [greedyPolicy('greedy-0'), greedyPolicy('greedy-1'), greedyPolicy('greedy-2')];

describe('enumerateLegalMoves + chooseBotMove', () => {
  it('surfaces flow legality and delegates choice to the policy', () => {
    const session = createSession(raceGame, { seed: 3, config: schema.defaults(), seats: 2 });
    expect(enumerateLegalMoves(raceGame, session).map((m) => m.id)).toEqual([
      'take0',
      'take1',
      'take2',
    ]);

    const picky: BotPolicy<RaceState> = {
      id: 'picky',
      label: 'picky',
      tier: 2,
      chooseMove: (_view, _seat, legal) => legal.find((m) => m.id === 'take1') ?? null,
    };
    const choice = chooseBotMove(
      picky,
      session.state,
      0,
      enumerateLegalMoves(raceGame, session),
      makeRng(5),
    );
    expect(choice?.id).toBe('take1');
  });
});

describe('runBotGame', () => {
  it('drives a match to completion deterministically', () => {
    const a = runBotGame(raceGame, { seed: 7, policies: POLICIES });
    const b = runBotGame(raceGame, { seed: 7, policies: POLICIES });
    expect(a).toEqual(b);
    expect(a.result?.reason).toBe('goal-reached');
    expect(a.result?.winner).not.toBeNull();
    expect(a.events).toBeGreaterThan(0);
    expect(a.seats).toBe(3);
  });

  it('fails closed when an acting seat has no policy', () => {
    expect(() =>
      runBotGame(raceGame, { seed: 7, policies: [greedyPolicy('only'), undefined] }),
    ).toThrow(/no bot policy seated at 1/);
  });

  it('fails closed on a stuck game via maxEvents', () => {
    const stalling = [
      scriptedPolicy('stall-0', [0]),
      scriptedPolicy('stall-1', [0]),
      scriptedPolicy('stall-2', [0]),
    ];
    expect(() => runBotGame(raceGame, { seed: 7, policies: stalling, maxEvents: 25 })).toThrow(
      /exceeded 25 events/,
    );
  });

  it('rejects empty policy tables', () => {
    expect(() => runBotGame(raceGame, { seed: 7, policies: [] })).toThrow(/at least one seat/);
  });
});

describe('simulateGames', () => {
  it('runs zero games into zero records', () => {
    expect(simulateGames(raceGame, 0, { baseSeed: 1, seatPoliciesFor: () => POLICIES })).toEqual([]);
  });

  it('rejects negative game counts', () => {
    expect(() =>
      simulateGames(raceGame, -1, { baseSeed: 1, seatPoliciesFor: () => POLICIES }),
    ).toThrow(/non-negative integer/);
  });

  it('seats policies per game index and records winners', () => {
    const records = simulateGames(raceGame, 4, {
      baseSeed: 100,
      seatPoliciesFor: (i) => (i % 2 === 0 ? POLICIES : [POLICIES[0], POLICIES[1]]),
    });
    expect(records).toHaveLength(4);
    for (const [i, record] of records.entries()) {
      expect(record.seed).toBe((100 + i) | 0);
      expect(record.winners.length).toBeGreaterThanOrEqual(1);
      expect(record.winners[0]).toBeLessThan(record.seats);
    }
  });
});

describe('aggregateWinRates', () => {
  it('counts one game per seated label even when labels repeat across seats', () => {
    const records = simulateGames(raceGame, 3, {
      baseSeed: 9,
      seatPoliciesFor: () => POLICIES,
    });
    const rows = aggregateWinRates(records, () => 'same');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.games).toBe(3);
  });

  it('splits credit between tied winners so credits sum to the game count', () => {
    const records = simulateGames(raceGame, 8, {
      baseSeed: 42,
      seatPoliciesFor: () => POLICIES,
    }).map((r, i) => (i === 0 ? { ...r, winners: [0, 1] as readonly SeatId[] } : r));

    const rows = aggregateWinRates(records, (_record, seat) => `seat${seat}`);
    const totalCredits = rows.reduce((sum, r) => sum + r.credits, 0);
    expect(totalCredits).toBeCloseTo(records.length, 10);

    for (const row of rows) {
      expect(row.games).toBe(8);
      expect(row.winRate).toBeGreaterThanOrEqual(0);
      expect(row.winRate).toBeLessThanOrEqual(1);
    }
  });

  it('handles empty records', () => {
    expect(aggregateWinRates([], () => 'x')).toEqual([]);
  });
});
