import { describe, expect, it } from 'vitest';
import { createSession, sessionApply } from '@parlour/engine';
import { createSpadesDef } from '../game';
import { spadesConfig } from '../config';
import { searchBot } from '../bots';

/**
 * The search bot's contract that a player depends on: it must bid through
 * the heuristic when the move set is bidding, and it must not throw when
 * asked to choose from any real legal set. The margin measurements live in
 * the thread report; this keeps the ladder from shipping a bot that crashes.
 */
describe('searchBot', () => {
  it('bids through the heuristic when the move set is bidding', () => {
    const def = createSpadesDef();
    let session = createSession(def, {
      seed: 99,
      config: spadesConfig.resolve({ targetScore: 250, nil: true }),
      seats: 4,
    });
    const bot = searchBot();
    // Bid through the engine for all four seats; the search bot must accept
    // the bid move set without crashing and without a move it cannot play.
    for (let step = 0; step < 4 && session.status === 'playing'; step++) {
      const acting = session.phase.actor as number;
      const view = def.playerView(session.state, acting);
      const legal = [...def.flow.legalMoves(session.state, session.phase)];
      const choice = bot.chooseMove(view as never, acting, legal as never, makeFakeRng() as never, {
        thinkMs: () => 200,
      });
      expect(choice).not.toBeNull();
      const out = sessionApply(def, session, acting, choice!.id, choice!.payload);
      expect(out.rejected).toBeUndefined();
      session = out.session;
    }
  });

  it('chooses a legal play without throwing when the move set is playing', () => {
    const def = createSpadesDef();
    let session = createSession(def, {
      seed: 42,
      config: spadesConfig.resolve({ targetScore: 250, nil: true }),
      seats: 4,
    });
    // Deal a full trick so the phase is 'playing' before the probe calls.
    for (const [seat, bid] of [
      [0, 3],
      [1, 4],
      [2, 3],
      [3, 2],
    ] as const) {
      session = sessionApply(def, session, seat, 'bid', { bid }).session;
    }
    const bot = searchBot();
    for (let step = 0; step < 4 && session.status === 'playing'; step++) {
      const acting = session.phase.actor as number;
      const view = def.playerView(session.state, acting);
      const legal = [...def.flow.legalMoves(session.state, session.phase)];
      const choice = bot.chooseMove(view as never, acting, legal as never, makeFakeRng() as never, {
        thinkMs: () => 200,
      });
      expect(choice).not.toBeNull();
      const out = sessionApply(def, session, acting, choice!.id, choice!.payload);
      expect(out.rejected).toBeUndefined();
      session = out.session;
    }
  }, 300_000);
});

function makeFakeRng(): unknown {
  const rng = {
    int: () => 3,
    float: () => 0.25,
    shuffle<T>(x: readonly T[]): T[] {
      return x.slice();
    },
    pick<T>(x: readonly T[]): T {
      return x[0] as T;
    },
    fork: () => rng,
    getState: () => [3],
    setState: () => {},
  };
  return rng as never;
}
