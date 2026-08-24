import { describe, expect, it } from 'vitest';
import {
  Fx,
  chooseBotMove,
  createMatch,
  makeRng,
  matchApply,
  matchInject,
  matchNextRound,
  replayMatch,
  type MatchDef,
  type MatchOutcome,
  type MatchSession,
} from '@parlour/engine';
import type { BlitzConfig } from './config';
import { blitzConfigSchema } from './config';
import {
  createBlitzLivesMatchDef,
  createBlitzTimedMatchDef,
  createBlitzWinsMatchDef,
  type BlitzLivesMatchState,
  type BlitzTimedMatchState,
  type BlitzWinsMatchState,
} from './match';
import type { BlitzState } from './state';

const OPTS = { config: blitzConfigSchema.defaults(), seats: 3 };

type AnyMatchState = BlitzLivesMatchState | BlitzWinsMatchState | BlitzTimedMatchState;

/** Bot-drives a Blitz match def to completion; returns the ended session. */
function drive<MS extends AnyMatchState>(
  def: MatchDef<BlitzState, BlitzConfig, MS>,
  seed: number,
): { session: MatchSession<BlitzState, BlitzConfig, MS>; foldFx: string[] } {
  let outcome = createMatch(def, { ...OPTS, seed }) as MatchOutcome<BlitzState, BlitzConfig, MS>;
  const foldFx: string[] = [];
  const record = (o: MatchOutcome<BlitzState, BlitzConfig, MS>) => {
    if (o.roundResult) foldFx.push(...o.fx.map((e) => e.kind));
  };
  record(outcome);
  let guard = 0;
  while (outcome.session.status !== 'ended') {
    if (guard++ > 5000) throw new Error(`match did not finish (seed ${seed})`);
    if (outcome.session.status === 'round-over') {
      outcome = matchNextRound(def, outcome.session) as typeof outcome;
      record(outcome);
      continue;
    }
    const round = outcome.session.round;
    const actor = round.phase.actor;
    if (actor === null) throw new Error('no actor while playing');
    const policy = def.game.bots[0];
    if (!policy) throw new Error('blitz ships no bots');
    const legal = def.game.flow.legalMoves(round.state, round.phase);
    const rng = makeRng(seed).fork(`test:${outcome.session.roundIndex}:${round.log.length}`);
    const choice =
      chooseBotMove(policy, def.game.playerView(round.state, actor), actor, legal, rng) ??
      legal[0]!;
    outcome = matchApply(def, outcome.session, actor, choice.id, choice.payload) as typeof outcome;
    if (outcome.rejected) throw new Error(outcome.rejected.message);
    record(outcome);
  }
  return { session: outcome.session, foldFx };
}

function finishRound<S extends BlitzState, MS extends AnyMatchState>(
  def: MatchDef<S, BlitzConfig, MS>,
  initial: MatchOutcome<S, BlitzConfig, MS>,
  seed: number,
): MatchOutcome<S, BlitzConfig, MS> {
  let outcome = initial;
  let guard = 0;
  while (outcome.session.status === 'playing') {
    if (guard++ > 1000) throw new Error('round did not finish');
    const round = outcome.session.round;
    const actor = round.phase.actor;
    if (actor === null) throw new Error('no actor while playing');
    const policy = def.game.bots[0]!;
    const legal = def.game.flow.legalMoves(round.state, round.phase);
    const choice =
      chooseBotMove(
        policy,
        def.game.playerView(round.state, actor),
        actor,
        legal,
        makeRng(seed).fork(`finish:${round.log.length}`),
      ) ?? legal[0]!;
    outcome = matchApply(def, outcome.session, actor, choice.id, choice.payload);
  }
  return outcome;
}

describe('createBlitzLivesMatchDef', () => {
  it('plays to a last seat standing (or a simultaneous-knockout draw)', () => {
    const def = createBlitzLivesMatchDef();
    for (const seed of [20260823, 7, 99, 2024, 31313]) {
      const { session, foldFx } = drive<BlitzLivesMatchState>(def, seed);
      expect(session.status).toBe('ended');
      const winner = session.result?.winner ?? null;
      if (winner !== null) {
        expect(session.match.lives[winner]).toBeGreaterThan(0);
        expect(session.match.lives.filter((l) => l > 0)).toHaveLength(1);
      } else {
        // tieLowest 'both' can knock out the final seats together — a draw
        expect(session.result?.reason).toBe('simultaneous knockout');
        expect(session.match.lives.every((l) => l === 0)).toBe(true);
      }
      expect(foldFx).toContain(Fx.ChipLoss);
      expect(session.history.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('never revives or double-eliminates a seat', () => {
    const def = createBlitzLivesMatchDef({ startingLives: 2 });
    const { session } = drive<BlitzLivesMatchState>(def, 77);
    expect(session.match.lives.every((l) => l >= 0 && l <= 2)).toBe(true);
  });

  it('replays a whole lives match from its round logs', () => {
    const def = createBlitzLivesMatchDef();
    const { session: live } = drive<BlitzLivesMatchState>(def, 424242);
    const replayed = replayMatch(def, 424242, live.roundLogs, {
      config: live.config,
      seats: live.seats,
    });
    expect(replayed.status).toBe('ended');
    expect(replayed.match).toEqual(live.match);
    expect(replayed.result).toEqual(live.result);
    expect(replayed.history).toEqual(live.history);
  });
});

describe('createBlitzWinsMatchDef', () => {
  it('ends when a seat reaches the target round wins', () => {
    const def = createBlitzWinsMatchDef({ target: 2 });
    const { session, foldFx } = drive<BlitzWinsMatchState>(def, 1337);
    expect(session.status).toBe('ended');
    const winner = session.result?.winner;
    expect(winner).not.toBeNull();
    expect(session.match.wins[winner!]).toBe(2);
    expect(Math.max(...session.match.wins)).toBe(2);
    expect(foldFx).toContain('match.point');
  });

  it('is deterministic per seed', () => {
    const def = createBlitzWinsMatchDef({ target: 2 });
    const a = drive<BlitzWinsMatchState>(def, 555);
    const b = drive<BlitzWinsMatchState>(def, 555);
    expect(a.session.match).toEqual(b.session.match);
    expect(a.session.result).toEqual(b.session.result);
  });
});

describe('createBlitzTimedMatchDef', () => {
  it('logs clock expiry in the active round and enters sudden death on a tie', () => {
    const durationMs = 5_000;
    const def = createBlitzTimedMatchDef({ durationMs });
    const created = createMatch(def, { ...OPTS, seed: 9090 });
    expect(
      matchInject(def, created.session, 'match.clock.expire', undefined, {
        atMs: durationMs - 1,
      }).rejected?.code,
    ).toBe('clock-still-running');

    const expired = matchInject(def, created.session, 'match.clock.expire', undefined, {
      atMs: durationMs,
    });
    expect(expired.events[0]).toMatchObject({
      move: 'match.clock.expire',
      seat: null,
      injected: true,
      atMs: durationMs,
    });
    expect(expired.session.match).toMatchObject({
      expired: true,
      expiredAtMs: durationMs,
      wins: [0, 0, 0],
    });
    expect(expired.session.status).toBe('round-over');

    const suddenDeath = matchNextRound(def, expired.session);
    const ended = finishRound(def, suddenDeath, 9090);
    expect(ended.session.status).toBe('ended');
    expect(ended.session.result?.winner).not.toBeNull();

    const replayed = replayMatch(def, 9090, ended.session.roundLogs, {
      config: ended.session.config,
      seats: ended.session.seats,
    });
    expect(replayed.match).toEqual(ended.session.match);
    expect(replayed.result).toEqual(ended.session.result);
  });

  it('keeps a unique leader when the clock expires', () => {
    const durationMs = 10_000;
    const def = createBlitzTimedMatchDef({ durationMs });
    let outcome = createMatch(def, { ...OPTS, seed: 6161 });
    outcome = finishRound(def, outcome, 6161);
    let guard = 0;
    while (
      outcome.session.match.wins.filter((wins) => wins === Math.max(...outcome.session.match.wins))
        .length !== 1
    ) {
      if (guard++ > 10) throw new Error('could not establish a unique pre-expiry leader');
      outcome = finishRound(def, matchNextRound(def, outcome.session), 6161 + guard);
    }
    outcome = matchNextRound(def, outcome.session);
    const expired = matchInject(def, outcome.session, 'match.clock.expire', undefined, {
      atMs: durationMs,
    });
    const leaders = expired.session.match.wins.filter(
      (wins) => wins === Math.max(...expired.session.match.wins),
    );
    expect(leaders).toHaveLength(1);
    expect(expired.session.status).toBe('ended');
  });
});
