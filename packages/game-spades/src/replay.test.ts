import { describe, expect, it } from 'vitest';
import {
  makeRng,
  replayMatchesLog,
  replaySession,
  runBotGame,
  sessionApply,
  stateHash,
} from '@parlour/engine';
import { TIER_BOTS } from './bots';
import { spadesConfig } from './config';
import { spadesGame } from './game';

const policies = [TIER_BOTS[2], TIER_BOTS[1], TIER_BOTS[0], TIER_BOTS[1]] as never;
const config = spadesConfig.resolve({ targetScore: 250 });

describe('replay determinism', () => {
  it('bot games end with a ranked result inside the event budget', () => {
    const record = runBotGame(spadesGame, {
      seed: 1_234,
      config,
      policies,
      maxEvents: 4_000,
    });
    expect(record.result).not.toBeNull();
    expect(record.events).toBeLessThan(4_000);
    expect(record.result!.rankings).toHaveLength(4);
  });

  it('reproduces identical state and hash from seed + log', () => {
    let session = replaySession(spadesGame, 777, [], { config, seats: 4 });
    const rng = makeRng(777).fork('driver');
    let guard = 0;
    while (session.status === 'playing' && guard++ < 8_000) {
      const acting = session.phase.actors ?? [session.phase.actor];
      for (const seat of acting) {
        if (session.status !== 'playing' || seat === null || seat === undefined) break;
        const legal = spadesGame.flow.legalMovesFor?.(session.state, session.phase, seat) ?? [];
        if (legal.length === 0) continue;
        const move = legal[rng.int(legal.length)]!;
        const outcome = sessionApply(spadesGame, session, seat, move.id, move.payload);
        if (outcome.rejected) throw new Error(outcome.rejected.code);
        session = outcome.session;
      }
    }
    expect(session.status).toBe('ended');

    const replayed = replaySession(spadesGame, 777, [...session.log], { config, seats: 4 });
    expect(stateHash(replayed.state)).toBe(stateHash(session.state));
    expect(replayed.result).toEqual(session.result);
    expect(replayMatchesLog(replayed.lastAppliedHash, [...session.log])).toBe(true);
  });

  it('two bot games with the same seed produce the same result', () => {
    const a = runBotGame(spadesGame, { seed: 404, config, policies, maxEvents: 4_000 });
    const b = runBotGame(spadesGame, { seed: 404, config, policies, maxEvents: 4_000 });
    expect(a.result).toEqual(b.result);
    expect(a.events).toBe(b.events);
  });
});
