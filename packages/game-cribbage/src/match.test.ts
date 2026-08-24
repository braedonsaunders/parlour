import {
  chooseBotMove,
  createMatch,
  makeRng,
  matchApply,
  matchNextRound,
  replayMatch,
  stateHash,
  type LegalMove,
  type MatchSession,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { tierBot } from './bots';
import { cribbageConfigSchema, type CribbageConfig } from './config';
import { createCribbageMatchDef, type CribbageMatchState } from './match';
import type { CribbageState } from './state';

type Session = MatchSession<CribbageState, CribbageConfig, CribbageMatchState>;

function playMatch(seed: number): Session {
  const config = cribbageConfigSchema.resolve({ gamesToWin: 2 });
  const def = createCribbageMatchDef();
  let session = createMatch(def, { seed, config, seats: 2 }).session;
  const rng = makeRng(seed).fork('cribbage-match-test');
  let guard = 0;

  while (session.status !== 'ended' && guard++ < 14_000) {
    if (session.status === 'round-over') {
      const opened = matchNextRound(def, session);
      expect(opened.rejected).toBeUndefined();
      session = opened.session;
      continue;
    }

    const turn = actingSeat(session);
    expect(turn).not.toBeNull();
    const { seat, legal } = turn!;
    const policy = tierBot(seat === 0 ? 3 : 2);
    const choice =
      chooseBotMove(policy, def.game.playerView(session.round.state, seat), seat, legal, rng) ??
      legal[0]!;
    const outcome = matchApply(def, session, seat, choice.id, choice.payload);
    expect(outcome.rejected).toBeUndefined();
    session = outcome.session;
  }

  expect(guard).toBeLessThan(14_000);
  expect(session.status).toBe('ended');
  return session;
}

function actingSeat(session: Session): { seat: number; legal: readonly LegalMove[] } | null {
  const { round } = session;
  for (const candidate of round.phase.actors ?? [round.phase.actor]) {
    if (candidate === null || candidate === undefined) continue;
    const legal =
      round.def.flow.legalMovesFor?.(round.state, round.phase, candidate) ??
      (round.phase.actor === candidate ? round.def.flow.legalMoves(round.state, round.phase) : []);
    if (legal.length > 0) return { seat: candidate, legal };
  }
  return null;
}

describe('cribbage match play', () => {
  it('takes its best-of-N target from the resolved house-rule config', () => {
    const def = createCribbageMatchDef();
    const match = def.init({
      config: cribbageConfigSchema.resolve({ gamesToWin: 3 }),
      seats: 2,
    });
    expect(match).toEqual({
      wins: [0, 0],
      targetWins: 3,
      lastGameReason: null,
      latestTotals: [0, 0],
    });
  });

  it('finishes and replays a best-of-three match deterministically', () => {
    const live = playMatch(424_242);
    expect(Math.max(...live.match.wins)).toBe(2);
    expect(live.result?.reason).toBe('best-of-3');

    const replayed = replayMatch(live.def, live.seed, live.roundLogs, {
      config: live.config,
      seats: live.seats,
    });
    expect(replayed.status).toBe('ended');
    expect(replayed.match).toEqual(live.match);
    expect(replayed.result).toEqual(live.result);
    expect(stateHash(replayed.round.state)).toBe(stateHash(live.round.state));
  });

  it('allows an explicit test/host override and rejects invalid targets', () => {
    const def = createCribbageMatchDef({ gamesToWin: 1 });
    expect(def.init({ config: cribbageConfigSchema.defaults(), seats: 2 }).targetWins).toBe(1);
    expect(() => createCribbageMatchDef({ gamesToWin: 0 })).toThrow(/positive integer/);
  });
});
