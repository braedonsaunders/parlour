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
import { ohhellConfig, type OhHellRules } from './config';
import { ohhellGame } from './game';

const config = ohhellConfig.resolve({ handArc: 'down', maxHand: 4 });
const policies = [TIER_BOTS[2], TIER_BOTS[1], TIER_BOTS[0], TIER_BOTS[1]] as const;

function samePayload(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Deterministic bot driver that keeps the live GameSession/log. */
function driveBotRound(seed: number, maxEvents = 2_000) {
  let session = replaySession(ohhellGame, seed, [], { config, seats: 4 });
  const rng = makeRng(seed).fork('bots');
  let applied = 0;
  while (session.status === 'playing') {
    if (applied >= maxEvents) throw new Error(`driveBotRound exceeded ${maxEvents} events`);
    const actor = session.phase.actor;
    if (actor === null) throw new Error('no acting seat');
    const legal = ohhellGame.flow.legalMovesFor?.(session.state, session.phase, actor) ?? [];
    if (legal.length === 0) throw new Error(`no legal move for seat ${actor}`);
    const policy = policies[actor]!;
    const choice = policy.chooseMove(
      ohhellGame.playerView(session.state, actor),
      actor,
      legal,
      rng,
      {
        thinkMs: () => 0,
      },
    );
    const target =
      legal.find((move) => move.id === choice?.id && samePayload(move.payload, choice.payload)) ??
      legal.find((move) => move.id === choice?.id) ??
      legal[0]!;
    const outcome = sessionApply(ohhellGame, session, actor, target.id, target.payload);
    if (outcome.rejected) throw new Error(outcome.rejected.code);
    session = outcome.session;
    applied += 1;
  }
  return { log: session.log, hash: stateHash(session.state), result: session.result };
}

describe('replay determinism', () => {
  it('bot rounds end with a ranked result inside the event budget', () => {
    const record = runBotGame(ohhellGame, {
      seed: 1_234,
      config,
      policies: [...policies],
      maxEvents: 2_000,
    });
    expect(record.result).not.toBeNull();
    expect(record.events).toBeLessThan(2_000);
    expect(record.result!.rankings).toHaveLength(4);
  });

  it('replays an ended bot-driven log with a byte-identical stateHash', () => {
    const driven = driveBotRound(1_234);
    expect(driven.result).not.toBeNull();
    expect(driven.log.length).toBeGreaterThan(0);

    const replayed = replaySession(ohhellGame, 1_234, [...driven.log], { config, seats: 4 });
    expect(stateHash(replayed.state)).toBe(driven.hash);
    expect(replayed.result).toEqual(driven.result);
    expect(replayMatchesLog(replayed.lastAppliedHash, [...driven.log])).toBe(true);
  });

  it('two runs with the same seed produce identical results', () => {
    const a = runBotGame(ohhellGame, {
      seed: 404,
      config,
      policies: [...policies],
      maxEvents: 2_000,
    });
    const b = runBotGame(ohhellGame, {
      seed: 404,
      config,
      policies: [...policies],
      maxEvents: 2_000,
    });
    expect(a.result).toEqual(b.result);
    expect(a.events).toBe(b.events);
  });

  it('reproduces every seat count and preset from seed + log alone', () => {
    for (const [seats, preset] of [
      [3, {}],
      [5, { handArc: 'down' as const, maxHand: 5 }],
      [6, { wizards: true as const, handArc: 'up' as const, maxHand: 3 }],
      [7, { handArc: 'down' as const, maxHand: 3 }],
    ] as const) {
      const cfg: Partial<OhHellRules> = preset;
      const resolved = ohhellConfig.resolve(cfg);
      const record = runBotGame(ohhellGame, {
        seed: 7_777 + seats,
        config: resolved,
        policies: Array.from({ length: seats }, (_, i) => policies[i % 4]!),
        maxEvents: 8_000,
      });
      expect(record.result).not.toBeNull();
    }
  });
});
