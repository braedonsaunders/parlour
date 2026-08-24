import { describe, expect, it } from 'vitest';
import {
  chooseBotMove,
  createMatch,
  makeRng,
  matchApply,
  matchNextRound,
  replayMatch,
  type MatchOutcome,
  type MatchSession,
} from '@parlour/engine';
import { ohhellConfig, type OhHellRules } from './config';
import { createOhHellMatchDef, type OhHellMatchState } from './match';
import type { OhHellState } from './state';

const def = createOhHellMatchDef();
const quickConfig = () => ohhellConfig.resolve({ handArc: 'down', maxHand: 5 });

/** Bot-drives a whole Oh Hell match to completion through the match runtime. */
function driveMatch(
  seed: number,
  seats = 4,
): MatchSession<OhHellState, OhHellRules, OhHellMatchState> {
  let outcome = createMatch(def, { seed, config: quickConfig(), seats }) as MatchOutcome<
    OhHellState,
    OhHellRules,
    OhHellMatchState
  >;
  let guard = 0;
  while (outcome.session.status !== 'ended') {
    if (guard++ > 20_000) throw new Error(`match did not finish (seed ${seed})`);
    if (outcome.session.status === 'round-over') {
      outcome = matchNextRound(def, outcome.session) as typeof outcome;
      continue;
    }
    const round = outcome.session.round;
    const actor = round.phase.actor;
    if (actor === null) throw new Error('no actor while a round is playing');
    const policy = def.game.bots[1]!;
    const legal = def.game.flow.legalMoves(round.state, round.phase);
    const rng = makeRng(seed).fork(`m:${outcome.session.roundIndex}:${round.log.length}`);
    const choice =
      chooseBotMove(policy, def.game.playerView(round.state, actor), actor, legal, rng) ??
      legal[0]!;
    outcome = matchApply(def, outcome.session, actor, choice.id, choice.payload) as typeof outcome;
    if (outcome.rejected) throw new Error(outcome.rejected.message);
  }
  return outcome.session;
}

describe('roundConfig', () => {
  it('supplies each round’s hand size and rotates the dealer', () => {
    const seats = 4;
    const created = createMatch(def, {
      seed: 1,
      config: ohhellConfig.resolve({}),
      seats,
    }).session;
    const base = ohhellConfig.resolve({});
    for (let index = 0; index < created.match.schedule.length; index++) {
      const adjusted = def.roundConfig!(created.match, index, base);
      expect(adjusted.handSize).toBe(created.match.schedule[index]);
      expect(adjusted.dealer).toBe(index % seats);
      // everything else passes through untouched
      expect(adjusted.hookRule).toBe(base.hookRule);
      expect(adjusted.scoring).toBe(base.scoring);
    }
  });

  it('deals every round of the driven match per the schedule', () => {
    const session = driveMatch(101);
    session.roundLogs.forEach((_, index) => {
      const result = session.history[index]!;
      // rankings carry bid/taken detail; taken sums to the scheduled hand size
      const taken = result.rankings.reduce((sum, row) => sum + Number(row.detail?.taken ?? 0), 0);
      expect(taken).toBe(session.match.schedule[index]);
    });
  });
});

describe('fold', () => {
  it('adds each seat’s round points into the cumulative scores', () => {
    const created = createMatch(def, { seed: 2, config: quickConfig(), seats: 3 }).session;
    const fakeResult = {
      winner: 1,
      reason: 'round-complete',
      rankings: [
        { seat: 0, rank: 2, detail: { points: 11 } },
        { seat: 1, rank: 1, detail: { points: 12 } },
        { seat: 2, rank: 3, detail: { points: 0 } },
      ],
    };
    const folded = def.fold(created.match, fakeResult, {
      roundIndex: 0,
      finalState: created.round.state,
      fx: { emit: () => {}, events: [] },
    });
    expect(folded.scores).toEqual([11, 12, 0]);
  });

  it('ends the match exactly after the last scheduled round', () => {
    const created = createMatch(def, { seed: 3, config: quickConfig(), seats: 4 }).session;
    const rounds = created.match.schedule.length;
    for (let index = 0; index < rounds - 1; index++) {
      expect(def.matchEnd(created.match, { roundIndex: index, seats: 4 })).toBeNull();
    }
    const ended = def.matchEnd(created.match, { roundIndex: rounds - 1, seats: 4 });
    expect(ended).not.toBeNull();
  });
});

describe('a full bot-driven match', () => {
  it('plays every scheduled round and ranks the cumulative scores', () => {
    const session = driveMatch(202_608_24);
    expect(session.status).toBe('ended');
    expect(session.history).toHaveLength(session.match.schedule.length);
    const totalPoints = session.history.flatMap((result) =>
      result.rankings.map((row) => Number(row.detail?.points ?? 0)),
    );
    expect(totalPoints.reduce((a, b) => a + b, 0)).toBe(
      session.match.scores.reduce((a, b) => a + b, 0),
    );
    const best = Math.max(...session.match.scores);
    const winners = session.result!.rankings.filter((row) => row.rank === 1);
    expect(winners.length).toBeGreaterThanOrEqual(1);
    for (const row of winners) {
      expect(session.match.scores[row.seat]).toBe(best);
    }
  });

  it('is deterministic per seed', () => {
    const a = driveMatch(555);
    const b = driveMatch(555);
    expect(a.match).toEqual(b.match);
    expect(a.history).toEqual(b.history);
    expect(a.result).toEqual(b.result);
  });

  it('replays the finished match byte-for-byte from its round logs', () => {
    const seed = 909_090;
    const live = driveMatch(seed);
    const replayed = replayMatch(def, seed, live.roundLogs, {
      config: live.config,
      seats: live.seats,
    });
    expect(replayed.status).toBe(live.status);
    expect(replayed.status).toBe('ended');
    expect(replayed.match).toEqual(live.match);
    expect(replayed.result).toEqual(live.result);
    expect(replayed.history).toEqual(live.history);
  });
});
