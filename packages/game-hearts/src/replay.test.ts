import { describe, expect, it } from 'vitest';
import {
  makeRng,
  replayMatchesLog,
  replaySession,
  runBotGame,
  sessionApply,
  stateHash,
} from '@parlour/engine';
import { heartsConfigSchema } from './config';
import { heartsGame } from './game';
import { HEARTS_BOTS } from './bots';
import type { HeartsState } from './state';

const policies = [HEARTS_BOTS[2], HEARTS_BOTS[1], HEARTS_BOTS[0], HEARTS_BOTS[1]] as never;

describe('replay determinism', () => {
  it('bot games end with a ranked result inside the event budget', () => {
    const record = runBotGame(heartsGame, {
      seed: 1_234,
      config: heartsConfigSchema.defaults(),
      policies,
      maxEvents: 400,
    });
    expect(record.result).not.toBeNull();
    expect(record.events).toBeLessThan(400);
    expect(record.result!.rankings).toHaveLength(4);
  });

  it('reproduces identical state and hash from seed + log', () => {
    const record = runBotGame(heartsGame, {
      seed: 777,
      config: heartsConfigSchema.defaults(),
      policies,
      maxEvents: 400,
    });
    void record;
    // drive our own session so we keep the log
    let session = replaySession<HeartsState, ReturnType<typeof heartsConfigSchema.defaults>>(
      heartsGame,
      777,
      [],
      { config: heartsConfigSchema.defaults(), seats: 4 },
    );
    const rng = makeRng(777).fork('driver');
    while (session.status === 'playing') {
      const acting = session.phase.actors ?? [session.phase.actor!];
      for (const seat of acting) {
        if (session.status !== 'playing') break;
        const legal =
          heartsGame.flow.legalMovesFor?.(session.state, session.phase, seat) ?? [];
        if (legal.length === 0) continue;
        const move = legal[rng.int(legal.length)]!;
        const outcome = sessionApply(heartsGame, session, seat, move.id, move.payload);
        if (outcome.rejected) throw new Error(outcome.rejected.code);
        session = outcome.session;
      }
      if (guard(session)) break;
    }
    expect(session.status).toBe('ended');

    const replayed = replaySession(heartsGame, 777, [...session.log], {
      config: heartsConfigSchema.defaults(),
      seats: 4,
    });
    expect(stateHash(replayed.state)).toBe(stateHash(session.state));
    expect(replayed.result).toEqual(session.result);
    expect(replayMatchesLog(replayed.lastAppliedHash, [...session.log])).toBe(true);
  });

  function guard(_session: unknown): boolean {
    return false;
  }
});

describe('fx timeline', () => {
  it('every play emits a tricks.play hint and completed tricks emit collects', () => {
    const record = runBotGame(heartsGame, {
      seed: 555,
      config: heartsConfigSchema.defaults(),
      policies,
      maxEvents: 400,
    });
    void record;
    // drive once more capturing fx
    let session = replaySession(heartsGame, 555, [], {
      config: heartsConfigSchema.defaults(),
      seats: 4,
    });
    const fxKinds = new Set<string>((session.setupFx ?? []).map((event) => event.kind));
    const rng = makeRng(555).fork('fx');
    while (session.status === 'playing') {
      const acting = session.phase.actors ?? [session.phase.actor!];
      for (const seat of acting) {
        if (session.status !== 'playing') break;
        const legal = heartsGame.flow.legalMovesFor?.(session.state, session.phase, seat) ?? [];
        if (legal.length === 0) continue;
        const move = legal[rng.int(legal.length)]!;
        const outcome = sessionApply(heartsGame, session, seat, move.id, move.payload);
        session = outcome.session;
        for (const event of outcome.fx) fxKinds.add(event.kind);
      }
    }
    expect(fxKinds.has('tricks.play')).toBe(true);
    expect(fxKinds.has('tricks.collect')).toBe(true);
    expect(fxKinds.has(FX_DEAL)).toBe(true);
  });
});

const FX_DEAL = 'card.fly';
