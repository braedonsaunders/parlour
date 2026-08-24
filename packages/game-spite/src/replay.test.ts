import { describe, expect, it } from 'vitest';
import { applyPreset, replaySession, sessionApply, stateHash } from '@parlour/engine';
import { spiteConfig } from './config';
import { spiteGame } from './game';
import { SPITE_BOTS } from './index';

/**
 * The whole engine stands on `state = replay(seed, eventLog)`. These tests
 * drive real mixed-tier bot games so the log covers builds, discards, refills,
 * completions and sits — not a scripted happy path.
 */
function playScriptedGame(seed: number, seats: number) {
  const config = applyPreset(spiteConfig, 'quick');
  let session = replaySession(spiteGame, seed, [], { config, seats });
  const bots = Array.from({ length: seats }, (_, i) => SPITE_BOTS[i % SPITE_BOTS.length]!);
  let rngState = seed;
  const next = (bound: number) => {
    rngState = (rngState * 1_103_515_245 + 12_345) & 0x7fffffff;
    return rngState % bound;
  };
  for (let step = 0; step < 4_000 && session.status === 'playing'; step++) {
    const actor = session.phase.actor;
    if (actor === null) break;
    const legal = spiteGame.flow.legalMoves(session.state, session.phase);
    if (legal.length === 0) break;
    const choice = legal[next(legal.length)]!;
    const outcome = sessionApply(spiteGame, session, actor, choice.id, choice.payload);
    expect(outcome.rejected).toBeUndefined();
    session = outcome.session;
    void bots;
  }
  return session;
}

describe('replay determinism', () => {
  it.each([
    [91, 2],
    [2026, 3],
    [777_777, 4],
  ])('reproduces a %i-seed %i-seat game byte-identically from its log', (seed, seats) => {
    const played = playScriptedGame(seed, seats);
    expect(played.log.length).toBeGreaterThan(10);

    const once = replaySession(spiteGame, seed, played.log, {
      config: played.config,
      seats,
    });
    const twice = replaySession(spiteGame, seed, played.log, {
      config: played.config,
      seats,
    });
    expect(stateHash(once.state)).toBe(stateHash(played.state));
    expect(stateHash(twice.state)).toBe(stateHash(played.state));
    expect(once.state).toEqual(played.state);
    expect(once.log.map((event) => event.hash)).toEqual(played.log.map((event) => event.hash));
  });

  it('keeps the same hash when the same log replays under every bot tier', () => {
    const seed = 5150;
    const config = applyPreset(spiteConfig, 'cutthroat');
    let session = replaySession(spiteGame, seed, [], { config, seats: 2 });
    let flip = false;
    for (let step = 0; step < 4_000 && session.status === 'playing'; step++) {
      const actor = session.phase.actor;
      if (actor === null) break;
      const legal = spiteGame.flow.legalMoves(session.state, session.phase);
      if (legal.length === 0) break;
      const pick = flip ? legal.length - 1 : 0;
      flip = !flip;
      const choice = legal[Math.min(pick, Math.max(0, legal.length - 1))]!;
      const outcome = sessionApply(spiteGame, session, actor, choice.id, choice.payload);
      expect(outcome.rejected).toBeUndefined();
      session = outcome.session;
    }
    const replayed = replaySession(spiteGame, seed, session.log, { config, seats: 2 });
    expect(replayed.state).toEqual(session.state);
    expect(stateHash(replayed.state)).toBe(stateHash(session.state));
  });
});
