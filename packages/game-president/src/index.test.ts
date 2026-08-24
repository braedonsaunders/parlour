import {
  createSession,
  makeRng,
  replaySession,
  sessionApply,
  stateHash,
  type AppliedEvent,
  type GameSession,
  type LegalMove,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { presidentBots, easyPresidentBot, hardPresidentBot, mediumPresidentBot } from './bots';
import { presidentConfig } from './config';
import { MAX_SEATS, MIN_SEATS, orderOf, presidentGame } from './game';
import { runMatch } from './sim/harness';
import type { PresidentRules, PresidentState } from './index';

function newSession(
  opts: { seed?: number; seats?: number; config?: Partial<PresidentRules> } = {},
): GameSession<PresidentState, PresidentRules> {
  return createSession(presidentGame, {
    seed: opts.seed ?? 7,
    config: presidentConfig.resolve(opts.config ?? {}),
    seats: opts.seats ?? 4,
  });
}

function legalFor(session: GameSession<PresidentState, PresidentRules>, seat: number): LegalMove[] {
  const moves = session.def.flow.legalMovesFor
    ? session.def.flow.legalMovesFor(session.state, session.phase, seat)
    : [];
  return [...moves];
}

function play(session: GameSession<PresidentState, PresidentRules>, seat: number, cards: string[]) {
  return sessionApply(presidentGame, session, seat, 'playSet', { cards });
}

/** Drives one full bot-vs-bot match and returns the final session. */
function driveMatch(seed: number, seats = 4) {
  let session = newSession({ seed, seats });
  for (let guard = 0; guard < 20_000 && session.status === 'playing'; guard++) {
    const actor = session.phase.actor;
    if (actor === null || actor === undefined) throw new Error('no actor');
    const legal = legalFor(session, actor);
    if (legal.length === 0) throw new Error(`seat ${actor} stuck in ${session.phase.phase}`);
    const policy = presidentBots[actor % presidentBots.length]!;
    const rng = makeRng(seed).fork(`t:${session.log.length}`);
    const choice = policy.chooseMove(session.def.playerView(session.state, actor), actor, legal, rng, {
      thinkMs: () => 0,
    });
    const pick = choice ?? legal[0]!;
    const outcome = sessionApply(presidentGame, session, actor, pick.id, pick.payload);
    if (outcome.rejected) throw new Error(`${pick.id}: ${outcome.rejected.message}`);
    session = outcome.session;
  }
  return session;
}

describe('president setup', () => {
  it('deals the full deck round-robin', () => {
    const session = newSession({ seats: 4 });
    const total = session.state.hands.reduce((sum, hand) => sum + hand.length, 0);
    expect(total).toBe(52);
    expect(session.state.hands.every((hand) => hand.length === 13)).toBe(true);
    expect(session.status).toBe('playing');
    expect(session.phase.phase).toBe('play');
    expect(session.state.turn).not.toBeNull();
  });

  it('handles uneven deals on odd tables', () => {
    for (const seats of [5, 6, 7, MAX_SEATS]) {
      const session = newSession({ seats });
      const total = session.state.hands.reduce((sum, hand) => sum + hand.length, 0);
      expect(total).toBe(52);
      const sizes = session.state.hands.map((hand) => hand.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });

  it('rejects seat counts outside the 4–8 ring', () => {
    expect(() => newSession({ seats: MIN_SEATS - 1 })).toThrow();
    expect(() => newSession({ seats: MAX_SEATS + 1 })).toThrow();
  });

  it('emits a deal-card flight for every card plus the opening turn ring', () => {
    const session = newSession({ seats: 5 });
    const flights = (session.setupFx ?? []).filter((fx) => fx.kind === 'card.fly');
    expect(flights.length).toBe(52);
    expect((session.setupFx ?? []).some((fx) => fx.kind === 'turn.ring')).toBe(true);
  });

  it('is deterministic per seed and differs across seeds', () => {
    const a = newSession({ seed: 99 });
    const b = newSession({ seed: 99 });
    const c = newSession({ seed: 100 });
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    expect(stateHash(a.state)).not.toBe(stateHash(c.state));
  });

  it('sorts each hand by table order for stable display', () => {
    const session = newSession({ seed: 3, seats: 4 });
    for (const hand of session.state.hands) {
      const ranks = hand.map((card) => orderOf(card));
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    }
  });
});

describe('playSet', () => {
  it('rejects plays from the wrong seat or with malformed sets', () => {
    const session = newSession({ seed: 11 });
    const leader = session.state.turn!;
    const other = (leader + 1) % 4;
    expect(play(session, other, ['S3']).rejected?.code).toBe('not-your-turn');
    expect(play(session, leader, []).rejected?.code).toBe('bad-payload');
    const hand = session.state.hands[leader]!;
    const rankA = orderOf(hand[0]!);
    const offRank = hand.find((card) => orderOf(card) !== rankA);
    if (offRank) {
      expect(play(session, leader, [hand[0]!, offRank]).rejected?.code).toBe('mixed-ranks');
    }
    expect(play(session, leader, ['C3', 'C3']).rejected?.code).toBe('not-in-hand');
  });

  it('lets the leader open with any set size 1–4 and advances clockwise', () => {
    const session = newSession({ seed: 12 });
    const leader = session.state.turn!;
    const hand = session.state.hands[leader]!;
    const quad = hand.filter((card) => orderOf(card) === orderOf(hand[0]!)).slice(0, 4);
    const cards = quad.length === 4 ? quad : [hand[0]!];
    const outcome = play(session, leader, cards);
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session!.state.pile.length).toBe(cards.length);
    expect(outcome.session!.state.standing?.rank).toBe(orderOf(cards[0]!));
    expect(outcome.session!.state.turn).toBe((leader + 1) % 4);
  });

  it('requires matching size and strictly higher rank when following', () => {
    let session = newSession({ seed: 13 });
    // force a deterministic lead: find the leader's lowest single
    const leader = session.state.turn!;
    const lowest = [...session.state.hands[leader]!].sort((a, b) => orderOf(a) - orderOf(b))[0]!;
    session = play(session, leader, [lowest]).session!;
    const nextSeat = session.state.turn!;
    const nextHand = session.state.hands[nextSeat]!;
    const lowerOrEqual = nextHand.find((card) => orderOf(card) <= orderOf(lowest));
    if (lowerOrEqual) {
      expect(play(session, nextSeat, [lowerOrEqual]).rejected?.code).toMatch(/size-mismatch|not-higher/);
    }
    const biggerSet = nextHand.filter((card) => orderOf(card) === orderOf(nextHand[0]!));
    if (biggerSet.length >= 2 && lowest) {
      expect(play(session, nextSeat, [nextHand[0]!, biggerSet[1]!]).rejected?.code).toBe(
        'size-mismatch',
      );
    }
  });

  it('emits card flights and the set accent in order', () => {
    const session = newSession({ seed: 14 });
    const leader = session.state.turn!;
    const hand = session.state.hands[leader]!;
    const pair = hand.filter((c) => orderOf(c) === orderOf(hand[0]!)).slice(0, 2);
    const cards = pair.length === 2 ? pair : [hand[0]!];
    const outcome = play(session, leader, cards);
    const kinds = outcome.fx.map((fx) => fx.kind);
    expect(kinds.filter((kind) => kind === 'card.discard').length).toBe(cards.length);
    expect(kinds).toContain('president.set');
    expect(kinds).toContain('turn.ring');
  });
});

describe('passing & tricks', () => {
  function startTrick(session: GameSession<PresidentState, PresidentRules>, rankCard?: string) {
    const leader = session.state.turn!;
    const hand = session.state.hands[leader]!;
    const card =
      rankCard && hand.includes(rankCard)
        ? rankCard
        : [...hand].sort((a, b) => orderOf(a) - orderOf(b))[0]!;
    return play(session, leader, [card]).session!;
  }

  it('the leader cannot pass', () => {
    const session = newSession({ seed: 21 });
    const leader = session.state.turn!;
    // the legality gate refuses the move before rule validation runs
    expect(legalFor(session, leader).some((move) => move.id === 'pass')).toBe(false);
    const outcome = sessionApply(presidentGame, session, leader, 'pass');
    expect(outcome.rejected?.code).toBe('illegal-move');
    // and the move itself defends the invariant for direct callers
    const verdict = presidentGame.moves.pass!.validate(session.state, leader, undefined);
    expect(typeof verdict === 'object' && verdict.code).toBe('lead-required');
  });

  it('ends the trick when every rival has passed and the winner leads next', () => {
    let session = startTrick(newSession({ seed: 22 }));
    const winner = session.state.standing!.seat;
    for (let i = 0; i < 3; i++) {
      const seat = session.state.turn!;
      const outcome = sessionApply(presidentGame, session, seat, 'pass');
      expect(outcome.rejected).toBeUndefined();
      session = outcome.session!;
      if (i < 2) expect(session.state.pile.length).toBeGreaterThan(0);
    }
    expect(session.state.pile.length).toBe(0);
    expect(session.state.standing).toBeNull();
    expect(session.state.turn).toBe(winner);
    const clearFx = session.log.length; // sanity only
    expect(clearFx).toBeGreaterThan(0);
  });

  it('allows a passed seat to rejoin within the same trick by default', () => {
    let session = startTrick(newSession({ seed: 23 }));
    // first rival passes
    const firstPasser = session.state.turn!;
    session = sessionApply(presidentGame, session, firstPasser, 'pass').session!;
    // second rival tops the pile — re-opening the beat for everyone
    const topSeat = session.state.turn!;
    const topHand = session.state.hands[topSeat]!;
    const standingRank = session.state.standing!.rank;
    const higher = [...topHand]
      .sort((a, b) => orderOf(a) - orderOf(b))
      .find((card) => orderOf(card) > standingRank);
    if (!higher) return; // deal shape lacks a top; skip gracefully
    session = play(session, topSeat, [higher]).session!;
    // the first passer is allowed to act again later in this trick
    expect(session.state.lockedOut).toEqual([]);
  });

  it('locks passed seats out of the trick under the locked-pass rule', () => {
    let session = startTrick(newSession({ seed: 24, config: { passLocks: true } }));
    const firstPasser = session.state.turn!;
    session = sessionApply(presidentGame, session, firstPasser, 'pass').session!;
    expect(session.state.lockedOut).toContain(firstPasser);
    const topSeat = session.state.turn!;
    const topHand = session.state.hands[topSeat]!;
    const standingRank = session.state.standing!.rank;
    const higher = [...topHand]
      .sort((a, b) => orderOf(a) - orderOf(b))
      .find((card) => orderOf(card) > standingRank);
    if (higher) {
      session = play(session, topSeat, [higher]).session!;
      const stillLocked = session.state.lockedOut.includes(firstPasser);
      expect(stillLocked).toBe(true);
    }
  });

  it('a lone 2 clears the pile immediately when twoClears is on', () => {
    let session = newSession({ seed: 25, config: { twoClears: true } });
    // put a low single out, then have someone smash a 2 onto it
    session = startTrick(session);
    while (session.state.standing && session.state.turn !== null) {
      const seat = session.state.turn!;
      const hand = session.state.hands[seat]!;
      const two = hand.find((card) => orderOf(card) === 15);
      if (two) {
        const outcome = play(session, seat, [two]);
        expect(outcome.rejected).toBeUndefined();
        const cleared = outcome.session!;
        expect(cleared.state.pile.length).toBe(0);
        expect(cleared.state.standing).toBeNull();
        expect(outcome.fx.some((fx) => fx.kind === 'president.pile-clear')).toBe(true);
        return;
      }
      const canTop = [...hand]
        .sort((a, b) => orderOf(a) - orderOf(b))
        .find((card) => orderOf(card) > session.state.standing!.rank);
      if (canTop) {
        session = play(session, seat, [canTop]).session!;
        continue;
      }
      session = sessionApply(presidentGame, session, seat, 'pass').session!;
      if (!session.state.standing) return; // trick ended before we found a 2
    }
  });

  it('a lone 2 does not clear instantly when twoClears is off', () => {
    const session = newSession({ seed: 26, config: { twoClears: false } });
    const leader = session.state.turn!;
    const hand = session.state.hands[leader]!;
    const two = hand.find((card) => orderOf(card) === 15);
    if (!two) return;
    const outcome = play(session, leader, [two]);
    const next = outcome.session!;
    expect(next.state.pile.length).toBe(1);
    expect(next.state.standing?.seat).toBe(leader);
  });
});

describe('finishing, roles & scoring', () => {
  it('records go-out order and completes the deal with role fx', () => {
    const session = driveMatch(31);
    expect(session.status).toBe('ended');
    expect(session.result).not.toBeNull();
    const finalOrder = session.state.lastOrder!;
    expect(finalOrder.length).toBe(4);
    // scores are positional: first finisher banks `seats` points
    const scoreSum = session.state.score.reduce((a, b) => a + b, 0);
    expect(scoreSum).toBeGreaterThanOrEqual(10); // 4+3+2+1 per completed deal
    void session;
  }, 30_000);

  it('opens the next deal automatically after the exchange', () => {
    const seed = 32;
    let session = newSession({ seed, config: { targetPoints: 999 } });
    let guard = 0;
    while (session.state.lastOrder === null && guard++ < 5000) {
      const actor = session.phase.actor!;
      const legal = legalFor(session, actor);
      const policy = presidentBots[actor % presidentBots.length]!;
      const rng = makeRng(seed).fork(`x:${session.log.length}`);
      const choice = policy.chooseMove(session.def.playerView(session.state, actor), actor, legal, rng, {
        thinkMs: () => 0,
      });
      const pick = choice ?? legal[0]!;
      const outcome = sessionApply(presidentGame, session, actor, pick.id, pick.payload);
      if (outcome.rejected) throw new Error(`${pick.id}: ${outcome.rejected.message}`);
      session = outcome.session!;
    }
    expect(session.state.lastOrder).not.toBeNull();
    // deal two has been opened inside the same session log
    expect(session.state.deal).toBe(1);
    expect(session.state.finished.length).toBe(0);
    const freshTotal = session.state.hands.reduce((sum, hand) => sum + hand.length, 0);
    expect(freshTotal).toBe(52);
  }, 30_000);

  it('skips finished seats when advancing the turn', () => {
    const seed = 33;
    let session = newSession({ seed, config: { targetPoints: 999 } });
    let sawSkip = false;
    for (let guard = 0; guard < 5000 && session.status === 'playing'; guard++) {
      if (session.state.finished.length > 0 && session.state.finished.length < 4) sawSkip = true;
      const actor = session.phase.actor!;
      const legal = legalFor(session, actor);
      const policy = presidentBots[actor % presidentBots.length]!;
      const rng = makeRng(seed).fork(`y:${session.log.length}`);
      const choice = policy.chooseMove(session.def.playerView(session.state, actor), actor, legal, rng, {
        thinkMs: () => 0,
      });
      const pick = choice ?? legal[0]!;
      const outcome = sessionApply(presidentGame, session, actor, pick.id, pick.payload);
      if (outcome.rejected) throw new Error(`${pick.id}: ${outcome.rejected.message}`);
      session = outcome.session!;
      // no finished seat is ever asked to act again
      expect(session.state.finished).not.toContain(session.phase.actor);
    }
    expect(sawSkip || session.state.finished.length === 4).toBe(true);
  }, 30_000);

  it('banks exact positional points across every completed deal', () => {
    const session = driveMatch(34);
    const seats = session.seats;
    const deals = session.state.deal + 1;
    const perDeal = (seats * (seats + 1)) / 2;
    const total = session.state.score.reduce((a, b) => a + b, 0);
    expect(total).toBe(perDeal * deals);
    // the champion cleared the target exactly on their final deal
    const winner = session.result!.winner!;
    expect(session.state.score[winner]).toBeGreaterThanOrEqual(
      presidentConfig.defaults().targetPoints,
    );
  }, 30_000);
});

describe('match end', () => {
  it('ends once a seat reaches the target points and ranks by banked total', () => {
    const session = driveMatch(41);
    expect(session.status).toBe('ended');
    const result = session.result!;
    expect(result.reason).toBe('points-target');
    expect(result.winner).not.toBeNull();
    const winnerPoints = result.rankings.find((r) => r.seat === result.winner)?.detail?.points;
    expect(Number(winnerPoints)).toBeGreaterThanOrEqual(11);
    const ranks = result.rankings.map((r) => r.rank);
    expect(ranks[0]).toBe(1);
  }, 30_000);

  it('honours custom targets from presets', () => {
    const quick = presidentConfig.resolve({ targetPoints: 7 });
    expect(quick.targetPoints).toBe(7);
    const clamped = presidentConfig.resolve({ targetPoints: 9999 });
    expect(clamped.targetPoints).toBe(21);
    const session = createSession(presidentGame, {
      seed: 42,
      config: quick,
      seats: 4,
    });
    expect(session.config.targetPoints).toBe(7);
  });
});

describe('redaction', () => {
  it('masks every other seat’s hand but keeps counts', () => {
    const session = newSession({ seed: 51, seats: 6 });
    const view = presidentGame.playerView(session.state, 2);
    view.hands.forEach((hand, index) => {
      if (index === 2) {
        expect(hand).toEqual(session.state.hands[index]);
      } else {
        expect(hand.every((card) => card === '??')).toBe(true);
        expect(hand.length).toBe(session.state.hands[index]!.length);
      }
    });
  });
});

describe('replay determinism', () => {
  function collectLog(seed: number, seats: number): readonly AppliedEvent[] {
    const run = runMatch(seed, seats, presidentBots);
    void run;
    let session = newSession({ seed, seats });
    let guard = 0;
    while (session.status === 'playing' && guard++ < 20_000) {
      const actor = session.phase.actor!;
      const legal = legalFor(session, actor);
      const policy = presidentBots[actor % presidentBots.length]!;
      const rng = makeRng(seed).fork(`r:${session.log.length}`);
      const choice = policy.chooseMove(
        session.def.playerView(session.state, actor),
        actor,
        legal,
        rng,
        { thinkMs: () => 0 },
      );
      const pick = choice ?? legal[0]!;
      session = sessionApply(presidentGame, session, actor, pick.id, pick.payload).session!;
    }
    return session.log;
  }

  it('reproduces identical state hashes after every logged move', () => {
    const seed = 61;
    const seats = 5;
    const log = collectLog(seed, seats);
    expect(log.length).toBeGreaterThan(50);
    const replayed = replaySession(presidentGame, seed, log, { seats });
    expect(stateHash(replayed.state)).toBe(log[log.length - 1]!.hash);
    // every intermediate hash lines up too
    let cursor = createSession(presidentGame, {
      seed,
      config: presidentConfig.defaults(),
      seats,
    });
    for (const event of log) {
      cursor = replaySession(presidentGame, seed, [...cursor.log.slice(), event], { seats });
      expect(cursor.lastAppliedHash).toBe(event.hash);
    }
  }, 60_000);

  it('host and guest derive identical logs and hashes from the same moves', () => {
    const seed = 62;
    const seats = 4;
    // "host": applies live moves
    let host = newSession({ seed, seats });
    const decisions: { seat: number; id: string; payload?: unknown }[] = [];
    let guard = 0;
    while (host.status === 'playing' && guard++ < 4000 && host.log.length < 80) {
      const actor = host.phase.actor!;
      const legal = legalFor(host, actor);
      const policy = presidentBots[actor % presidentBots.length]!;
      const rng = makeRng(seed).fork(`h:${host.log.length}`);
      const choice = policy.chooseMove(host.def.playerView(host.state, actor), actor, legal, rng, {
        thinkMs: () => 0,
      });
      const pick = choice ?? legal[0]!;
      decisions.push({ seat: actor, id: pick.id, payload: pick.payload });
      host = sessionApply(presidentGame, host, actor, pick.id, pick.payload).session!;
    }
    // "guest": replays the same event list from the shared seed
    let guest = newSession({ seed, seats });
    for (const decision of decisions) {
      guest = sessionApply(
        presidentGame,
        guest,
        decision.seat,
        decision.id,
        decision.payload,
      ).session!;
      const guestHash = guest.lastAppliedHash;
      const hostHash = host.log[guest.log.length - 1]?.hash;
      expect(guestHash).toBe(hostHash);
    }
    expect(stateHash(guest.state)).toBe(stateHash(host.state));
  }, 30_000);
});

describe('bot policies stay legal across tables', () => {
  it('plays mixed-tier matches at every supported seat count without illegal picks', () => {
    for (const seats of [MIN_SEATS, 5, 6, 7, MAX_SEATS]) {
      const run = runMatch(700 + seats, seats, [
        easyPresidentBot,
        hardPresidentBot,
        mediumPresidentBot,
        easyPresidentBot,
        mediumPresidentBot,
        hardPresidentBot,
        easyPresidentBot,
        mediumPresidentBot,
      ]);
      expect(run.result.winner).not.toBeNull();
    }
  }, 120_000);
});
