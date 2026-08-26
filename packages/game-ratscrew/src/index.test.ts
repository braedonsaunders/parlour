import {
  applyPreset,
  createFx,
  createSession,
  makeRng,
  replayMatchesLog,
  replaySession,
  runBotGame,
  sessionApply,
  sessionInject,
  type GameSession,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { ratscrewConfigSchema, type RatscrewConfig } from './config';
import { RATSCREW_MAX_SEATS, SLAP_GRACE_MS, ratscrewGame, type RatscrewState } from './game';
import { chancesFor, detectPattern, isFaceCard, isRun, rankOf } from './patterns';

function defaults(): RatscrewConfig {
  return ratscrewConfigSchema.resolve({});
}

function state(patch: Partial<RatscrewState> = {}): RatscrewState {
  return {
    rules: defaults(),
    seats: 2,
    piles: [['S3', 'S2'], ['H7']],
    center: [],
    turn: 0,
    challenge: null,
    window: null,
    pendingWin: null,
    lastFlipper: 0,
    veiled: false,
    ...patch,
  };
}

function apply(state: RatscrewState, seat: number, moveId: string) {
  const fx = createFx();
  const next = ratscrewGame.moves[moveId]!.apply(state, seat, undefined, {
    rng: makeRng(1),
    fx,
    event: { seq: 0 },
  });
  return { next, fx: fx.events };
}

describe('patterns', () => {
  it('detects doubles, sandwiches and tens by priority', () => {
    expect(detectPattern(['H5', 'S5'], defaults())).toBe('double');
    expect(detectPattern(['H5', 'S9', 'D5'], defaults())).toBe('sandwich');
    expect(detectPattern(['H3', 'S7'], { ...defaults(), tens: true })).toBe('ten');
    expect(detectPattern(['H3', 'S7'], defaults())).toBeNull();
    // double wins over sandwich when both match
    expect(detectPattern(['H5', 'S5', 'C5'], defaults())).toBe('double');
    expect(detectPattern(['H5'], defaults())).toBeNull();
    expect(detectPattern([], defaults())).toBeNull();
  });

  it('detects marriages in either order', () => {
    const rules = { ...defaults(), marriage: true };
    expect(detectPattern(['H13', 'S12'], rules)).toBe('marriage');
    expect(detectPattern(['H12', 'S13'], rules)).toBe('marriage');
    expect(detectPattern(['H13', 'S11'], rules)).toBeNull();
    expect(detectPattern(['H13', 'S12'], defaults())).toBeNull();
  });

  it('detects top-bottom against the very bottom card', () => {
    const rules = { ...defaults(), topBottom: true };
    expect(detectPattern(['H5', 'S9', 'D2', 'C5'], rules)).toBe('top-bottom');
    expect(detectPattern(['H5', 'S9', 'D2', 'C6'], rules)).toBeNull();
    expect(detectPattern(['H5', 'S5'], rules)).toBe('double');
  });

  it('detects climbing and falling runs across three cards', () => {
    const rules = { ...defaults(), runs: true };
    expect(detectPattern(['H4', 'S5', 'D6'], rules)).toBe('run');
    expect(detectPattern(['H6', 'S5', 'D4'], rules)).toBe('run');
    expect(detectPattern(['H11', 'S12', 'D13'], rules)).toBe('run');
    expect(detectPattern(['H1', 'S2', 'D3'], rules)).toBe('run');
    expect(detectPattern(['H4', 'S5', 'D7'], rules)).toBeNull();
    expect(detectPattern(['H4', 'S5'], rules)).toBeNull();
    expect(detectPattern(['H4', 'S5', 'D6'], defaults())).toBeNull();
  });

  it('ranks overlapping patterns by fixed priority', () => {
    const all = ratscrewConfigSchema.resolve({
      marriage: true,
      tens: true,
      topBottom: true,
      runs: true,
    });
    // double beats top-bottom (bottom card also ranks 5)
    expect(detectPattern(['H5', 'S9', 'D5', 'C5'], all)).toBe('double');
    // sandwich beats marriage (Q…Q around a King)
    expect(detectPattern(['H12', 'S13', 'C12'], all)).toBe('sandwich');
    // marriage beats ten (K+Q are face cards so they never sum to ten anyway)
    expect(detectPattern(['H13', 'S12'], all)).toBe('marriage');
  });

  it('honours disabled toggles', () => {
    const off = ratscrewConfigSchema.resolve({ doubles: false, sandwiches: false });
    expect(detectPattern(['H5', 'S5'], off)).toBeNull();
    expect(detectPattern(['H5', 'S9', 'D5'], off)).toBeNull();
  });

  it('classifies std-deck ids', () => {
    expect(rankOf('H12')).toBe(12);
    expect(isFaceCard('H12')).toBe(true);
    expect(isFaceCard('S10')).toBe(false);
    expect(() => rankOf('X14')).toThrow();
  });

  it('treats the Ace as the top face card, worth four chances', () => {
    expect(isFaceCard('S1')).toBe(true);
    expect(chancesFor('S1')).toBe(4);
    expect(chancesFor('S11')).toBe(1);
    expect(chancesFor('S12')).toBe(2);
    expect(chancesFor('S13')).toBe(3);
    // …so an Ace can never be half of a sum-to-ten slap
    expect(detectPattern(['S1', 'H9'], { ...defaults(), tens: true })).toBeNull();
  });

  it('recognises runs through the run helper', () => {
    expect(isRun(4, 5, 6)).toBe(true);
    expect(isRun(6, 5, 4)).toBe(true);
    expect(isRun(4, 6, 5)).toBe(false);
    expect(isRun(13, 1, 2)).toBe(false);
  });
});

describe('flip reducer', () => {
  it('moves the top card onto the center and passes the turn', () => {
    const { next, fx } = apply(state(), 0, 'flip');
    expect(next.center).toEqual(['S3']);
    expect(next.piles[0]).toEqual(['S2']);
    expect(next.turn).toBe(1);
    expect(next.window).toBeNull();
    expect(fx.some((e) => e.kind === 'card.flip')).toBe(true);
  });

  it('skips empty seats when advancing the turn', () => {
    const started = apply(state({ piles: [['S2'], [], ['H9']], seats: 3 }), 0, 'flip').next;
    expect(started.turn).toBe(2);
  });

  it('opens a slap window on a double and pauses everything', () => {
    const doubled = apply(state({ center: ['D6'], piles: [['S6', 'S3'], ['H7']] }), 0, 'flip');
    expect(doubled.next.window).toEqual({ pattern: 'double', openedAtMs: null });
    expect(doubled.next.pendingWin).toBeNull();
    expect(doubled.fx.some((e) => e.kind === 'ratscrew.slap-window')).toBe(true);
  });

  it('stamps the window with authority time when the flip carries atMs', () => {
    const fx = createFx();
    const next = ratscrewGame.moves.flip!.apply(
      state({ center: ['D6'], piles: [['S6', 'S3'], ['H7']] }),
      0,
      undefined,
      { rng: makeRng(1), fx, event: { seq: 3, atMs: 4200 } },
    );
    expect(next.window).toEqual({ pattern: 'double', openedAtMs: 4200 });
  });

  it('starts a face-card challenge with rank-based chances', () => {
    const queen = apply(state({ piles: [['H12', 'S3'], ['H7']], turn: 0 }), 0, 'flip').next;
    expect(queen.challenge).toEqual({ challenger: 0, target: 1, chancesLeft: 2 });
    expect(queen.turn).toBe(1);
  });

  it('burns chances then pays the challenger when they run out', () => {
    const challenged = state({
      piles: [['S4'], ['S3', 'H9']],
      turn: 1,
      challenge: { challenger: 0, target: 1, chancesLeft: 1 },
      center: ['H12'],
    });
    const burned = apply(challenged, 1, 'flip');
    expect(burned.next.challenge).toBeNull();
    expect(burned.next.pendingWin).toBeNull(); // paid out immediately, no window
    expect(burned.next.turn).toBe(0);
    expect(burned.next.center).toEqual([]); // collected immediately, no window
    expect(burned.next.piles[0]).toContain('S4');
    expect(burned.fx.some((e) => e.kind === 'ratscrew.pile-win')).toBe(true);
  });

  it('hands the challenge to the next player when a new face card lands', () => {
    const passed = apply(
      state({
        piles: [['S13'], ['C13', 'H7']],
        turn: 1,
        challenge: { challenger: 0, target: 1, chancesLeft: 2 },
        center: ['H12'],
      }),
      1,
      'flip',
    ).next;
    expect(passed.challenge).toEqual({ challenger: 1, target: 0, chancesLeft: 3 });
    expect(passed.turn).toBe(0);
  });

  it('pays the challenger when the target answers with their last card', () => {
    const paid = apply(
      state({
        piles: [['S4'], ['S3']],
        turn: 1,
        challenge: { challenger: 0, target: 1, chancesLeft: 3 },
        center: ['H12'],
      }),
      1,
      'flip',
    ).next;
    // target emptied their pile — they cannot answer any more flips
    expect(paid.pendingWin).toBeNull();
    expect(paid.challenge).toBeNull();
    expect(paid.center).toEqual([]);
    expect(paid.piles[0]).toContain('S3');
  });
});

describe('slap reducer', () => {
  it('awards the whole center pile to the first slapper and voids challenges', () => {
    const opened = apply(
      state({
        center: ['D6'],
        piles: [
          ['S6', 'S10'],
          ['C2', 'H5'],
        ],
        challenge: { challenger: 1, target: 0, chancesLeft: 2 },
        lastFlipper: 1,
      }),
      0,
      'flip',
    ).next;
    expect(opened.window?.pattern).toBe('double');

    const slapped = apply(opened, 0, 'slap');
    expect(slapped.next.window).toBeNull();
    expect(slapped.next.challenge).toBeNull();
    expect(slapped.next.center).toEqual([]);
    expect(slapped.next.turn).toBe(0);
    // seat 0's stack keeps its order; won cards go underneath
    expect(slapped.next.piles[0]).toEqual(['S10', 'D6', 'S6']);
    expect(slapped.fx.find((e) => e.kind === 'ratscrew.slap')).toMatchObject({
      payload: { seat: 0, pattern: 'double', cards: ['S6', 'D6'] },
    });
  });

  it('overrides a paused pile payout when slapped first', () => {
    const slapped = apply(
      state({
        center: ['D6'],
        piles: [['S6']],
        challenge: null,
        pendingWin: 1, // seat 1 earned the pile but a window opened on this flip
        window: { pattern: 'double', openedAtMs: null },
        lastFlipper: 0,
      }),
      0,
      'slap',
    );
    // slap validates against the open window, not the pending payout
    expect(slapped.next.piles[0]).toEqual(['S6', 'D6']);
    expect(slapped.next.pendingWin).toBeNull();
  });

  it('burns the slapper’s top card under the pile when no pattern is live', () => {
    const missed = apply(state({ piles: [['S3', 'S2'], ['H7']], center: ['D6'] }), 0, 'slap');
    expect(missed.next.piles[0]).toEqual(['S2']);
    expect(missed.next.center).toEqual(['D6', 'S3']);
    expect(missed.next.turn).toBe(0);
    expect(missed.fx.some((e) => e.kind === 'ratscrew.misslap')).toBe(true);
    expect(missed.fx.some((e) => e.kind === 'ratscrew.burn')).toBe(true);
  });

  it('never consumes a challenge chance on a burn', () => {
    const challenged = state({
      piles: [['S4'], ['S3', 'H9']],
      turn: 1,
      challenge: { challenger: 0, target: 1, chancesLeft: 2 },
      center: ['H12'],
    });
    const burned = apply(challenged, 1, 'slap').next;
    expect(burned.challenge).toEqual({ challenger: 0, target: 1, chancesLeft: 2 });
    expect(burned.turn).toBe(1);
    expect(burned.center).toEqual(['H12', 'S3']);
  });

  it('rejects penalty slaps when mis-slap burns are switched off', () => {
    const rules = ratscrewConfigSchema.resolve({ misSlapBurn: false });
    const verdict = ratscrewGame.moves.slap!.validate(state({ rules }), 0, undefined);
    expect(verdict).toEqual({ code: 'no-window', message: 'nothing is slappable right now' });
  });

  it('rejects penalty slaps from an empty seat — there is nothing to burn', () => {
    const verdict = ratscrewGame.moves.slap!.validate(state({ piles: [[], ['H7']] }), 0, undefined);
    expect(verdict).toEqual({ code: 'empty-pile', message: 'nothing left to burn' });
  });

  it('lets an empty seat slap back in when re-entry is on', () => {
    const opened = apply(
      state({ center: ['D6'], piles: [['S6'], []], lastFlipper: 1 }),
      0,
      'flip',
    ).next;
    expect(opened.window?.pattern).toBe('double');
    // the flipper burned their own last card into the race — both seats are dry
    expect(opened.piles[0]).toHaveLength(0);

    const comeback = apply(opened, 1, 'slap');
    expect(comeback.next.window).toBeNull();
    expect(comeback.next.center).toEqual([]);
    expect(comeback.next.turn).toBe(1);
    expect(comeback.next.piles[1]).toEqual(['D6', 'S6']);
    expect(comeback.fx.some((e) => e.kind === 'ratscrew.comeback')).toBe(true);
  });

  it('locks empty seats out of live windows when re-entry is off', () => {
    const rules = ratscrewConfigSchema.resolve({ slapBackIn: false });
    const live = state({
      rules,
      window: { pattern: 'double', openedAtMs: null },
      piles: [['S10'], []],
    });
    expect(ratscrewGame.moves.slap!.validate(live, 1, undefined)).toEqual({
      code: 'empty-pile',
      message: 'out of cards and slap-back-in is off',
    });
    // and the flow never even offers them the slap
    const phase = ratscrewGame.flow.start(live, live.seats);
    expect(ratscrewGame.flow.legalMovesFor!(live, phase, 1)).toEqual([]);
  });
});

describe('windowClose', () => {
  it('resumes play and pays a pending pile win', () => {
    const closed = apply(
      state({
        center: ['D6', 'S6'],
        window: { pattern: 'double', openedAtMs: null },
        pendingWin: 1,
        piles: [['S3'], []],
      }),
      -1,
      'windowClose',
    ).next;
    expect(closed.window).toBeNull();
    expect(closed.center).toEqual([]);
    expect(closed.turn).toBe(1);
  });

  it('is only injectable while a slap window is open', () => {
    const seed = 7;
    const session = createSession(ratscrewGame, { seed, config: defaults(), seats: 2 });
    const refused = sessionInject(ratscrewGame, session, 'windowClose');
    expect(refused.rejected?.code).toBe('no-window');
  });

  it('refuses an authority close that lands before the window expires', () => {
    const seed = 42;
    let session = createSession(ratscrewGame, { seed, config: defaults(), seats: 2 });
    // force a double onto the pile, then open the window under a clock
    session = sessionApply(ratscrewGame, session, 0, 'flip', undefined, { atMs: 100 }).session;
    session = sessionApply(ratscrewGame, session, 1, 'flip', undefined, { atMs: 200 }).session;
    let opened: typeof session | null = null;
    for (let guard = 0; guard < 60 && !opened; guard++) {
      const seat = session.state.turn as number;
      const attempt = sessionApply(ratscrewGame, session, seat, 'flip', undefined, {
        atMs: 300 + guard * 50,
      });
      if (!attempt.rejected && attempt.session.state.window) opened = attempt.session;
      else if (!attempt.rejected) session = attempt.session;
      else break;
    }
    if (!opened) throw new Error('fixture failed to open a slap window');
    expect((opened.state as RatscrewState).window?.openedAtMs).not.toBeNull();

    const openedAt = (opened.state as RatscrewState).window!.openedAtMs!;
    const tooEarly = sessionInject(ratscrewGame, opened, 'windowClose', undefined, {
      atMs: openedAt + 50,
    });
    expect(tooEarly.rejected?.code).toBe('window-too-young');

    const onTime = sessionInject(ratscrewGame, opened, 'windowClose', undefined, {
      atMs: openedAt + ratscrewGame.configSchema.defaults().slapWindowMs,
    });
    expect(onTime.rejected).toBeUndefined();
    expect(onTime.session.state.window).toBeNull();
  });

  it('accepts unstamped closes for rooms that do not track authority time', () => {
    const session = createSession(ratscrewGame, { seed: 42, config: defaults(), seats: 2 });
    let opened = session;
    for (let guard = 0; guard < 60; guard++) {
      const seat = opened.state.turn as number;
      const attempt = sessionApply(ratscrewGame, opened, seat, 'flip');
      if (attempt.rejected) break;
      opened = attempt.session;
      if (opened.state.window) break;
    }
    expect(opened.state.window).not.toBeNull();
    const outcome = sessionInject(ratscrewGame, opened, 'windowClose');
    expect(outcome.rejected).toBeUndefined();
  });
});

describe('auto-resolved deadlocks', () => {
  it('forfeits the challenge when the target burns their last card', () => {
    const seed = 5;
    const config = defaults();
    // Hand-build a mid-challenge board through the public setup API.
    const forged = state({
      rules: config,
      piles: [['S4', 'S3'], ['H9']],
      center: ['H12'],
      turn: 1,
      challenge: { challenger: 0, target: 1, chancesLeft: 2 },
      lastFlipper: 1,
    });

    // seat 1 mis-slaps away their final card…
    const burned = ratscrewGame.moves.slap!.apply(forged, 1, undefined, {
      rng: makeRng(seed),
      fx: createFx(),
      event: { seq: 0 },
    });
    expect(burned.piles[1]).toHaveLength(0);

    // …and the flow settles the stuck challenge automatically.
    const advance = ratscrewGame.flow.advance(burned, { seq: 1, seat: 1, move: 'slap' }, 2);
    expect(advance.autoMoves).toEqual([
      {
        seat: null,
        move: 'challengeForfeit',
        payload: undefined,
        reason: 'challenge-target-empty',
      },
    ]);

    // through the runtime the forfeit is applied + logged as an automatic event
    const fx = createFx();
    const paid = ratscrewGame.moves.challengeForfeit!.apply(burned, -1, undefined, {
      rng: makeRng(seed),
      fx,
      event: { seq: 1 },
    });
    expect(paid.challenge).toBeNull();
    expect(paid.center).toEqual([]);
    expect(paid.turn).toBe(0);
    expect(paid.piles[0]).toContain('H12');
    expect(paid.piles[0]).toContain('H9');
  });

  it('scoops the pile to the last flipper when every stack runs dry', () => {
    const drained = state({
      piles: [[], []],
      center: ['H5', 'S5', 'D9'],
      lastFlipper: 1,
      turn: 0,
    });
    const advance = ratscrewGame.flow.advance(drained, { seq: 9, seat: 1, move: 'flip' }, 2);
    expect(advance.autoMoves?.[0]?.move).toBe('exhaustedScoop');

    const scooped = ratscrewGame.moves.exhaustedScoop!.apply(drained, -1, undefined, {
      rng: makeRng(1),
      fx: createFx(),
      event: { seq: 10 },
    });
    expect(scooped.center).toEqual([]);
    expect(scooped.piles[1]).toHaveLength(3);
    expect(scooped.turn).toBe(1);
    // …which leaves one seat holding every card: the match ends
    expect(ratscrewGame.end(scooped)?.winner).toBe(1);
  });

  it('waits for the center scoop before declaring a winner with re-entry on', () => {
    const almost = state({ piles: [['S3'], []], center: ['H7'] });
    expect(ratscrewGame.end(almost)).toBeNull();
    const scooped = ratscrewGame.moves.exhaustedScoop!.apply(almost, -1, undefined, {
      rng: makeRng(1),
      fx: createFx(),
      event: { seq: 0 },
    });
    expect(ratscrewGame.end(scooped)?.winner).toBe(0);
  });

  it('does not end the match while a slap race is live', () => {
    const racing = state({
      piles: [['S3'], []],
      center: [],
      window: { pattern: 'double', openedAtMs: null },
    });
    expect(ratscrewGame.end(racing)).toBeNull();
  });
});

describe('flow & runtime integration', () => {
  /** Flips around the table until a slap window opens (doubles are frequent). */
  function openWindow(
    base: GameSession<RatscrewState, RatscrewConfig>,
  ): GameSession<RatscrewState, RatscrewConfig> {
    let current = base;
    for (let guard = 0; guard < 200 && !current.state.window; guard++) {
      const actor = current.phase.actor;
      if (actor === null || actor === undefined) break;
      const outcome = sessionApply(ratscrewGame, current, actor, 'flip');
      if (outcome.rejected) throw new Error(outcome.rejected.message);
      current = outcome.session;
    }
    if (!current.state.window) throw new Error(`no window for seed ${base.seed}`);
    return current;
  }

  it('enters a multi-actor slap phase listing every eligible seat', () => {
    const session = openWindow(
      createSession(ratscrewGame, { seed: 42, config: defaults(), seats: 2 }),
    );
    expect(session.phase.phase).toBe('slap');
    expect(session.phase.actor).toBeNull();
    expect(session.phase.actors).toHaveLength(2);
  });

  it('offers the turn rider a flip and everyone else only a risk slap', () => {
    const session = createSession(ratscrewGame, { seed: 1, config: defaults(), seats: 2 });
    const phase = session.phase;
    expect(ratscrewGame.flow.legalMoves(session.state, phase)).toEqual([
      { id: 'flip' },
      { id: 'slap' },
    ]);
    expect(ratscrewGame.flow.legalMovesFor!(session.state, phase, 1)).toEqual([{ id: 'slap' }]);
    // with burns off, non-turn seats get nothing between flips
    const calm = ratscrewConfigSchema.resolve({ misSlapBurn: false });
    const quiet = createSession(ratscrewGame, { seed: 1, config: calm, seats: 2 });
    expect(ratscrewGame.flow.legalMovesFor!(quiet.state, quiet.phase, 1)).toEqual([]);
  });

  it('accepts exactly one winning slap; the late rival burns a card', () => {
    const session = openWindow(
      createSession(ratscrewGame, { seed: 42, config: defaults(), seats: 2 }),
    );
    const actors = session.phase.actors ?? [];
    const winner = actors[0] as number;
    const loser = actors[1] as number;
    const applied = sessionApply(ratscrewGame, session, winner, 'slap');
    expect(applied.rejected).toBeUndefined();
    const won = applied.session;
    expect(won.phase.phase).toBe('flip');

    // the loser's slap arrives after the window closed: penalty burn, not a win
    const loserCards = (won.state as RatscrewState).piles[loser]!.length;
    const late = sessionApply(ratscrewGame, won, loser, 'slap');
    expect(late.rejected).toBeUndefined();
    expect((late.session.state as RatscrewState).piles[loser]!.length).toBe(loserCards - 1);
    expect(late.fx.some((e) => e.kind === 'ratscrew.misslap')).toBe(true);
  });

  it('rejects out-of-turn flips outright', () => {
    const session = createSession(ratscrewGame, { seed: 1, config: defaults(), seats: 2 });
    expect(sessionApply(ratscrewGame, session, 1, 'flip').rejected?.code).toBe('illegal-move');
    expect(sessionApply(ratscrewGame, session, 1, 'windowClose').rejected?.code).toBe(
      'illegal-move',
    );
  });

  it('replays injected window-close events bit-for-bit', () => {
    const seed = 42;
    const session = openWindow(createSession(ratscrewGame, { seed, config: defaults(), seats: 2 }));
    const outcome = sessionInject(ratscrewGame, session, 'windowClose', undefined, { atMs: 1400 });
    expect(outcome.rejected).toBeUndefined();
    const stamped = outcome.session;
    expect(stamped.state.window).toBeNull();
    const injectedEvent = stamped.log.at(-1);
    expect(injectedEvent?.injected).toBe(true);

    const replayed = replaySession(ratscrewGame, seed, stamped.log, { seats: 2 });
    expect(replayMatchesLog(replayed.lastAppliedHash, stamped.log)).toBe(true);
    expect(replayed.state).toEqual(stamped.state);
  });

  it('keeps host and guest hashes identical across slaps, burns and closes', () => {
    const seed = 77;
    const config = defaults();
    let host = createSession(ratscrewGame, { seed, config, seats: 2 });
    let step = 0;
    while (host.status === 'playing' && step < 4000) {
      step += 1;
      if (host.state.window) {
        const actors = host.phase.actors ?? [];
        host = sessionApply(ratscrewGame, host, actors[0] as number, 'slap').session;
      } else {
        host = sessionApply(ratscrewGame, host, host.state.turn as number, 'flip').session;
      }
      // spot-check the guest replay periodically — a full re-replay per event
      // is quadratic and the final comparison below covers the whole log
      if (step % 500 === 0) {
        const guest = replaySession(ratscrewGame, seed, host.log, { config, seats: 2 });
        expect(guest.lastAppliedHash).toBe(host.lastAppliedHash);
      }
    }
    expect(host.status).toBe('ended');
    const guest = replaySession(ratscrewGame, seed, host.log, { config, seats: 2 });
    expect(guest.lastAppliedHash).toBe(host.lastAppliedHash);
    expect(guest.state).toEqual(host.state);
  }, 20_000);

  it('runs engine-harness bot matches to completion across seeds and seat counts', () => {
    // burns off keeps the single-actor harness honest; the real-time persona
    // driver in realtime.test.ts covers the default ruleset end-to-end.
    const config = ratscrewConfigSchema.resolve({ misSlapBurn: false, slapBackIn: false });
    for (const seats of [2, 3, 4]) {
      for (let seed = 0; seed < 8; seed++) {
        const record = runBotGame(ratscrewGame, {
          seed: seed * 31 + seats,
          config,
          policies: Array.from({ length: seats }, () => ratscrewGame.bots[0]),
        });
        expect(record.result?.winner).not.toBeNull();
        expect(record.events).toBeGreaterThan(seats);
      }
    }
  });

  it('masks every pile in playerView but keeps counts and the center readable', () => {
    const view = ratscrewGame.playerView(state({ center: ['H5'] }), 1);
    expect(view.piles[0]).toHaveLength(2);
    expect(view.piles[0]?.[0]).toBe('??');
    expect(view.piles[1]?.[0]).toBe('??');
    expect(view.center).toEqual(['H5']);
  });

  it('ends when one seat holds every card', () => {
    const finale = state({ piles: [['S3'], []], center: [] });
    expect(ratscrewGame.end(finale)?.winner).toBe(0);
    expect(ratscrewGame.end(finale)?.reason).toBe('last-standing');
    expect(ratscrewGame.end(state()) ?? null).toBeNull();
  });
});

describe('config & contract', () => {
  it('resolves presets over defaults', () => {
    expect(applyPreset(ratscrewConfigSchema, 'quick-reflex')).toMatchObject({ slapWindowMs: 700 });
    expect(applyPreset(ratscrewConfigSchema, 'slaphappy')).toMatchObject({
      tens: true,
      marriage: true,
      topBottom: true,
      runs: true,
    });
    expect(defaults()).toMatchObject({
      doubles: true,
      sandwiches: true,
      marriage: false,
      tens: false,
      topBottom: false,
      runs: false,
      misSlapBurn: true,
      slapBackIn: true,
      slapWindowMs: 1200,
    });
  });

  it('ships full instructions covering every house rule', () => {
    expect(ratscrewGame.id).toBe('ratscrew');
    expect(ratscrewGame.howToPlay.sections.length).toBeGreaterThan(3);
    expect(ratscrewGame.howToPlay.objective.length).toBeGreaterThan(10);
    const text = JSON.stringify(ratscrewGame.howToPlay);
    for (const term of ['Marriage', 'Top-bottom', 'Run', 'Mis-slaps', 'Slap back in']) {
      expect(text).toContain(term);
    }
  });

  it('deals all 52 cards round-robin, deterministically', () => {
    const deal = (seed: number) =>
      createSession(ratscrewGame, { seed, config: defaults(), seats: 3 }).state;
    const a = deal(99);
    const b = deal(99);
    expect(a).toEqual(b);
    const total = a.piles.reduce((sum, pile) => sum + pile.length, 0);
    expect(total).toBe(52);
    expect(a.piles.map((pile) => pile.length)).toEqual([18, 17, 17]);
  });

  it('caps the table at four seats', () => {
    expect(RATSCREW_MAX_SEATS).toBe(4);
    expect(() => createSession(ratscrewGame, { seed: 1, config: defaults(), seats: 5 })).toThrow(
      /2–4 seats/,
    );
    expect(() => createSession(ratscrewGame, { seed: 1, config: defaults(), seats: 1 })).toThrow(
      /2–4 seats/,
    );
  });

  it('exports the fairness grace window transports schedule against', () => {
    expect(SLAP_GRACE_MS).toBeGreaterThan(0);
    expect(SLAP_GRACE_MS).toBeLessThan(500);
  });
});
