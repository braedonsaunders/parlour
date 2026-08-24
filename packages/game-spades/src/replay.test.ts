import { describe, expect, it } from 'vitest';
import {
  makeRng,
  replayMatchesLog,
  replaySession,
  runBotGame,
  sessionApply,
  stateHash,
  type GameSession,
} from '@parlour/engine';
import { TIER_BOTS } from './bots';
import { spadesConfig, type SpadesRules } from './config';
import { spadesGame } from './game';
import type { SpadesState } from './state';

const policies = [TIER_BOTS[2], TIER_BOTS[1], TIER_BOTS[0], TIER_BOTS[1]] as const;
const config = spadesConfig.resolve({ targetScore: 250 });

function samePayload(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Deterministic bot driver that keeps the live GameSession/log. */
function driveBotMatch(seed: number, maxEvents = 4_000): GameSession<SpadesState, SpadesRules> {
  let session = replaySession(spadesGame, seed, [], { config, seats: 4 });
  const rng = makeRng(seed).fork('bots');
  let applied = 0;
  while (session.status === 'playing') {
    if (applied >= maxEvents) {
      throw new Error(`driveBotMatch: exceeded ${maxEvents} events (seed ${seed})`);
    }
    const acting = session.phase.actors ?? [session.phase.actor];
    let actor: number | null = null;
    let legal: ReturnType<NonNullable<typeof spadesGame.flow.legalMovesFor>> = [];
    for (const seat of acting) {
      if (seat === null || seat === undefined) continue;
      const forSeat = spadesGame.flow.legalMovesFor?.(session.state, session.phase, seat) ?? [];
      if (forSeat.length > 0) {
        actor = seat;
        legal = forSeat;
        break;
      }
    }
    if (actor === null) throw new Error(`driveBotMatch: no legal move (seed ${seed})`);
    const policy = policies[actor];
    if (!policy) throw new Error(`driveBotMatch: no policy at ${actor}`);
    const view = spadesGame.playerView(session.state, actor);
    let choice = policy.chooseMove(view, actor, legal, rng, { thinkMs: () => 0 });
    choice ??= legal[0]!;
    const target =
      legal.find((move) => move.id === choice.id && samePayload(move.payload, choice.payload)) ??
      legal.find((move) => move.id === choice.id) ??
      choice;
    const outcome = sessionApply(spadesGame, session, actor, target.id, target.payload);
    if (outcome.rejected) throw new Error(outcome.rejected.code);
    session = outcome.session;
    applied += 1;
  }
  return session;
}

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

  it('replays an ended bot-driven log with identical hash', () => {
    const session = driveBotMatch(1_234);
    expect(session.status).toBe('ended');
    expect(session.result).not.toBeNull();
    expect(session.log.length).toBeGreaterThan(0);

    const replayed = replaySession(spadesGame, 1_234, [...session.log], { config, seats: 4 });
    expect(replayed.status).toBe('ended');
    expect(stateHash(replayed.state)).toBe(stateHash(session.state));
    expect(replayed.result).toEqual(session.result);
    expect(replayed.state.handNo).toBe(session.state.handNo);
    expect(replayMatchesLog(replayed.lastAppliedHash, [...session.log])).toBe(true);
  });

  it('two bot games with the same seed produce the same result', () => {
    const a = runBotGame(spadesGame, { seed: 404, config, policies, maxEvents: 4_000 });
    const b = runBotGame(spadesGame, { seed: 404, config, policies, maxEvents: 4_000 });
    expect(a.result).toEqual(b.result);
    expect(a.events).toBe(b.events);
  });
});
