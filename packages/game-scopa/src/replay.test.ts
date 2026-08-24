import { describe, expect, it } from 'vitest';
import {
  makeRng,
  replayMatchesLog,
  replaySession,
  runBotGame,
  sessionApply,
  stateHash,
  type GameSession,
  type LegalMove,
} from '@parlour/engine';
import { TIER_BOTS } from './bots';
import { scopaConfig, type ScopaRules } from './config';
import { DECK } from './cards';
import { scopaGame } from './game';
import type { ScopaState } from './state';

const policiesFor = (seats: number) =>
  Array.from({ length: seats }, (_, seat) => TIER_BOTS[seat % TIER_BOTS.length]!);

function samePayload(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Deterministic bot driver that keeps the live GameSession/log. */
function driveBotMatch(
  seed: number,
  seats: number,
  config: ScopaRules,
  maxEvents = 6_000,
): GameSession<ScopaState, ScopaRules> {
  let session = replaySession(scopaGame, seed, [], { config, seats });
  const rng = makeRng(seed).fork('bots');
  const policies = policiesFor(seats);
  let applied = 0;
  while (session.status === 'playing') {
    if (applied >= maxEvents) throw new Error(`driveBotMatch: exceeded ${maxEvents} events`);
    const acting = session.phase.actors ?? [session.phase.actor];
    let actor: number | null = null;
    let legal: readonly LegalMove[] = [];
    for (const seat of acting) {
      if (seat === null || seat === undefined) continue;
      const forSeat = scopaGame.flow.legalMovesFor?.(session.state, session.phase, seat) ?? [];
      if (forSeat.length > 0) {
        actor = seat;
        legal = forSeat;
        break;
      }
    }
    if (actor === null) throw new Error(`driveBotMatch: no legal move (seed ${seed})`);
    const policy = policies[actor];
    if (!policy) throw new Error(`driveBotMatch: no policy at ${actor}`);
    const view = scopaGame.playerView(session.state, actor);
    let choice = policy.chooseMove(view, actor, legal, rng, { thinkMs: () => 0 });
    choice ??= legal[0]!;
    const target =
      legal.find((move) => move.id === choice!.id && samePayload(move.payload, choice!.payload)) ??
      legal.find((move) => move.id === choice!.id) ??
      choice!;
    const outcome = sessionApply(scopaGame, session, actor, target.id, target.payload);
    if (outcome.rejected) throw new Error(outcome.rejected.code);
    session = outcome.session;
    applied += 1;
  }
  return session;
}

/** Every card sits in exactly one zone after any state. */
function assertConserved(state: ScopaState): void {
  const zones = [...state.hands.flat(), ...state.stock, ...state.table, ...state.captures.flat()];
  expect(zones).toHaveLength(40);
  expect(new Set(zones).size).toBe(40);
  expect(new Set(zones)).toEqual(new Set(DECK.cardIds));
}

describe('replay determinism', () => {
  it('bot games end with a ranked result inside the event budget', () => {
    const record = runBotGame(scopaGame, {
      seed: 1_234,
      config: scopaConfig.resolve({ target: 11 }),
      policies: policiesFor(2),
      maxEvents: 6_000,
    });
    expect(record.result).not.toBeNull();
    expect(record.events).toBeLessThan(6_000);
    expect(record.result!.rankings).toHaveLength(2);
  });

  it('plays full matches at every supported seat count', () => {
    for (const seats of [2, 3, 4, 6] as const) {
      const record = runBotGame(scopaGame, {
        seed: 500 + seats,
        config: scopaConfig.resolve({ target: 11 }),
        policies: policiesFor(seats),
        maxEvents: 8_000,
      });
      expect(record.result).not.toBeNull();
      expect(record.result!.rankings).toHaveLength(seats);
    }
  });

  it('conserves all 40 cards across checkpoints of a driven match', () => {
    const seed = 888;
    const config = scopaConfig.resolve({});
    const live = driveBotMatch(seed, 2, config);
    const log = [...live.log];
    // incremental replay slices re-run every event; sample checkpoints so the
    // test stays fast while still touching early, middle and final states
    for (const cut of [1, Math.floor(log.length / 4), Math.floor(log.length / 2), log.length - 1]) {
      const partial = replaySession(scopaGame, seed, log.slice(0, cut + 1), {
        config,
        seats: 2,
      });
      assertConserved(partial.state);
    }
    assertConserved(live.state);
  });

  it('replays an ended bot-driven log with an identical hash', () => {
    const seed = 1_234;
    const config = scopaConfig.resolve({ target: 11 });
    const session = driveBotMatch(seed, 2, config);
    expect(session.status).toBe('ended');
    expect(session.log.length).toBeGreaterThan(0);

    const replayed = replaySession(scopaGame, seed, [...session.log], { config, seats: 2 });
    expect(replayed.status).toBe('ended');
    expect(stateHash(replayed.state)).toBe(stateHash(session.state));
    expect(replayed.result).toEqual(session.result);
    expect(replayMatchesLog(replayed.lastAppliedHash, [...session.log])).toBe(true);
  });

  it('produces byte-identical states for the same seed and log', () => {
    const a = driveBotMatch(404, 3, scopaConfig.resolve({ target: 16 }));
    const b = driveBotMatch(404, 3, scopaConfig.resolve({ target: 16 }));
    expect(a.log.map((event) => event.hash)).toEqual(b.log.map((event) => event.hash));
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  });
});
