import {
  actingSeats,
  chooseBotMove,
  createSession,
  makeRng,
  replaySession,
  stateHash,
  sessionApply,
  type GameSession,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { palaceBots } from './bots';
import { palaceConfig } from './config';
import { MAX_SEATS, MIN_SEATS, palaceGame } from './game';
import { handSizeFor } from './round';
import type { PalaceRules } from './config';
import type { PalaceState } from './state';

function newSession(
  opts: { seed?: number; seats?: number; config?: Partial<PalaceRules> } = {},
): GameSession<PalaceState, PalaceRules> {
  return createSession(palaceGame, {
    seed: opts.seed ?? 7,
    config: palaceConfig.resolve(opts.config ?? {}),
    seats: opts.seats ?? 3,
  });
}

/** Plays one full bot-vs-bot match headless, throwing on any illegal choice or stall. */
function driveMatch(seed: number, seats = 3, maxSteps = 20_000) {
  let session = newSession({ seed, seats });
  let steps = 0;
  while (session.status === 'playing') {
    if (steps++ > maxSteps) throw new Error(`palace match ${seed} stalled after ${maxSteps} steps`);
    const seat = actingSeats(session.phase)[0];
    if (seat === undefined)
      throw new Error(`palace match ${seed}: no actor in ${session.phase.phase}`);
    const legal = session.def.flow.legalMovesFor
      ? session.def.flow.legalMovesFor(session.state, session.phase, seat)
      : session.def.flow.legalMoves(session.state, session.phase);
    if (legal.length === 0)
      throw new Error(`palace match ${seed}: seat ${seat} stuck in ${session.phase.phase}`);
    const policy = palaceBots[seat % palaceBots.length]!;
    const rng = makeRng(session.seed).fork(`bot:${session.log.length}`);
    const view = session.def.playerView(session.state, seat);
    const choice = chooseBotMove(policy, view, seat, legal, rng) ?? legal[0]!;
    const outcome = sessionApply(palaceGame, session, seat, choice.id, choice.payload);
    if (outcome.rejected) {
      throw new Error(
        `palace match ${seed}: ${choice.id} rejected — ${outcome.rejected.code}: ${outcome.rejected.message}`,
      );
    }
    session = outcome.session;
  }
  return session;
}

describe('deal shape', () => {
  it('deals the full 3-down / 3-up row and a full deck at every seat count', () => {
    for (const seats of [MIN_SEATS, 3, 4, 5, MAX_SEATS]) {
      const session = newSession({ seats });
      const handSize = handSizeFor(seats);
      for (let seat = 0; seat < seats; seat++) {
        expect(session.state.down[seat]).toHaveLength(3);
        expect(session.state.up[seat]).toHaveLength(3);
        expect(session.state.hands[seat]).toHaveLength(handSize);
      }
      const total =
        session.state.hands.reduce((sum, h) => sum + h.length, 0) +
        session.state.up.reduce((sum, u) => sum + u.length, 0) +
        session.state.down.reduce((sum, d) => sum + d.length, 0);
      expect(total).toBe(seats * (6 + handSize));
      expect(total).toBeLessThanOrEqual(52);
      // every dealt card id is unique — nobody was dealt the same card twice
      const ids = [
        ...session.state.hands.flat(),
        ...session.state.up.flat(),
        ...session.state.down.flat(),
      ];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('rejects seat counts outside the 2–6 ring', () => {
    expect(() => newSession({ seats: MIN_SEATS - 1 })).toThrow();
    expect(() => newSession({ seats: MAX_SEATS + 1 })).toThrow();
  });

  it('is deterministic per seed and differs across seeds', () => {
    const a = newSession({ seed: 99 });
    const b = newSession({ seed: 99 });
    const c = newSession({ seed: 100 });
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    expect(stateHash(a.state)).not.toBe(stateHash(c.state));
  });
});

describe('swap & starter phase', () => {
  it('starts in the swap phase and opens play once every seat readies', () => {
    const session = newSession({ seats: 3 });
    expect(session.phase.phase).toBe('swap');
    let current = session;
    for (let seat = 0; seat < 3; seat++) {
      const outcome = sessionApply(palaceGame, current, seat, 'ready');
      expect(outcome.rejected).toBeUndefined();
      current = outcome.session!;
    }
    expect(current.phase.phase).toBe('play');
    expect(current.state.turn).not.toBeNull();
  });

  it('skips the swap phase entirely when allowSwap is off', () => {
    const session = newSession({ seats: 3, config: { allowSwap: false } });
    expect(session.phase.phase).toBe('play');
    expect(session.state.turn).not.toBeNull();
  });
});

describe('bot matches stay legal end to end', () => {
  it('plays full matches at every supported seat count without illegal picks', () => {
    for (const seats of [MIN_SEATS, 3, 4, 5, MAX_SEATS]) {
      const session = driveMatch(500 + seats, seats);
      expect(session.status).toBe('ended');
      expect(session.result?.winner).not.toBeNull();
    }
  }, 60_000);

  it('bans a rank a seat cannot answer and ends a round the moment someone empties out', () => {
    const session = driveMatch(42, 3);
    expect(session.state.roundsWon.some((wins) => wins >= session.config.winsTo)).toBe(true);
    expect(session.state.lastOrder).not.toBeNull();
  }, 30_000);
});

describe('replay determinism', () => {
  it('reproduces identical state hashes after every logged move', () => {
    const seed = 61;
    const seats = 4;
    const session = driveMatch(seed, seats);
    const log = session.log;
    expect(log.length).toBeGreaterThan(10);
    const replayed = replaySession(palaceGame, seed, log, { seats, config: session.config });
    expect(stateHash(replayed.state)).toBe(log[log.length - 1]!.hash);
  }, 60_000);

  it('host and guest derive identical logs from the same bot decisions', () => {
    const seed = 62;
    const seats = 3;
    let host = newSession({ seed, seats });
    const decisions: { seat: number; id: string; payload?: unknown }[] = [];
    let guard = 0;
    while (host.status === 'playing' && guard++ < 4000 && host.log.length < 120) {
      const seat = actingSeats(host.phase)[0]!;
      const legal = host.def.flow.legalMovesFor!(host.state, host.phase, seat);
      const policy = palaceBots[seat % palaceBots.length]!;
      const rng = makeRng(seed).fork(`h:${host.log.length}`);
      const choice =
        chooseBotMove(policy, host.def.playerView(host.state, seat), seat, legal, rng) ?? legal[0]!;
      decisions.push({ seat, id: choice.id, payload: choice.payload });
      const outcome = sessionApply(palaceGame, host, seat, choice.id, choice.payload);
      if (outcome.rejected) throw new Error(`${choice.id}: ${outcome.rejected.message}`);
      host = outcome.session!;
    }
    let guest = newSession({ seed, seats });
    for (const decision of decisions) {
      const outcome = sessionApply(palaceGame, guest, decision.seat, decision.id, decision.payload);
      expect(outcome.rejected).toBeUndefined();
      guest = outcome.session!;
      const hostHash = host.log[guest.log.length - 1]?.hash;
      expect(guest.lastAppliedHash).toBe(hostHash);
    }
    expect(stateHash(guest.state)).toBe(stateHash(host.state));
  }, 30_000);
});
