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
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { ratscrewConfigSchema, type RatscrewConfig } from './config';
import {
  ratscrewGame,
  type RatscrewState,
} from './game';
import { chancesFor, detectPattern, isFaceCard, rankOf } from './patterns';

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
    const started = apply(
      state({ piles: [['S2'], [], ['H9']], seats: 3 }),
      0,
      'flip',
    ).next;
    expect(started.turn).toBe(2);
  });

  it('opens a slap window on a double and pauses everything', () => {
    const doubled = apply(
      state({ center: ['D6'], piles: [['S6', 'S3'], ['H7']] }),
      0,
      'flip',
    );
    expect(doubled.next.window).toEqual({ pattern: 'double' });
    expect(doubled.next.pendingWin).toBeNull();
    expect(doubled.fx.some((e) => e.kind === 'ratscrew.slap-window')).toBe(true);
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
        piles: [['S6', 'S10'], ['C2', 'H5']],
        challenge: { challenger: 1, target: 0, chancesLeft: 2 },
        lastFlipper: 1,
      }),
      0,
      'flip',
    ).next;
    expect(opened.window).toEqual({ pattern: 'double' });

    const slapped = apply(opened, 0, 'slap');
    expect(slapped.next.window).toBeNull();
    expect(slapped.next.challenge).toBeNull();
    expect(slapped.next.center).toEqual([]);
    expect(slapped.next.turn).toBe(0);
    // seat 0's stack keeps its order; won cards go underneath
    expect(slapped.next.piles[0]).toEqual(['S10', 'D6', 'S6']);
  });

  it('overrides a paused pile payout when slapped first', () => {
    const slapped = apply(
      state({
        center: ['D6'],
        piles: [['S6']],
        challenge: null,
        pendingWin: 1, // seat 1 earned the pile but a window opened on this flip
        window: { pattern: 'double' },
        lastFlipper: 0,
      }),
      0,
      'slap',
    );
    // slap validates against the open window, not the pending payout
    expect(slapped.next.piles[0]).toEqual(['S6', 'D6']);
    expect(slapped.next.pendingWin).toBeNull();
  });

  it('rejects slaps with no live pattern', () => {
    const verdict = ratscrewGame.moves.slap!.validate(state(), 0, undefined);
    expect(verdict).toEqual({ code: 'no-window', message: 'nothing is slappable right now' });
  });
});

describe('windowClose', () => {
  it('resumes play and pays a pending pile win', () => {
    const closed = apply(
      state({
        center: ['D6', 'S6'],
        window: { pattern: 'double' },
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
});

describe('flow & runtime integration', () => {
  /** Flips around the table until a slap window opens (doubles are frequent). */
  function openWindow(seed: number, seats = 2) {
    let session = createSession(ratscrewGame, {
      seed,
      config: defaults(),
      seats,
    });
    for (let guard = 0; guard < 200 && !session.state.window; guard++) {
      const actor = session.phase.actor;
      if (actor === null || actor === undefined) break;
      const outcome = sessionApply(ratscrewGame, session, actor, 'flip');
      if (outcome.rejected) throw new Error(outcome.rejected.message);
      session = outcome.session;
    }
    if (!session.state.window) throw new Error(`no window for seed ${seed}`);
    return session;
  }

  it('enters a multi-actor slap phase listing every alive seat', () => {
    const session = openWindow(42);
    expect(session.phase.phase).toBe('slap');
    expect(session.phase.actor).toBeNull();
    expect(session.phase.actors).toHaveLength(2);
  });

  it('accepts exactly one winning slap then rejects late arrivals', () => {
    let session = openWindow(42);
    const actors = session.phase.actors ?? [];
    const winner = actors[0] as number;
    const applied = sessionApply(ratscrewGame, session, winner, 'slap');
    expect(applied.rejected).toBeUndefined();
    session = applied.session;
    expect(session.phase.phase).toBe('flip');
    const late = sessionApply(ratscrewGame, session, actors[1] as number, 'slap');
    expect(late.rejected?.code).toBe('not-your-turn');
  });

  it('replays injected window-close events bit-for-bit', () => {
    const seed = 42;
    let session = openWindow(seed);
    const outcome = sessionInject(ratscrewGame, session, 'windowClose', undefined, { atMs: 1400 });
    expect(outcome.rejected).toBeUndefined();
    session = outcome.session;
    expect(session.state.window).toBeNull();
    const injectedEvent = session.log.at(-1);
    expect(injectedEvent?.injected).toBe(true);

    const replayed = replaySession(ratscrewGame, seed, session.log, { seats: 2 });
    expect(replayMatchesLog(replayed.lastAppliedHash, session.log)).toBe(true);
    expect(replayed.state).toEqual(session.state);
  });

  it('ends when one seat holds every card', () => {
    const finale = state({ piles: [['S3'], []] });
    expect(ratscrewGame.end(finale)?.winner).toBe(0);
    expect(ratscrewGame.end(finale)?.reason).toBe('last-standing');
    expect(ratscrewGame.end(state()) ?? null).toBeNull();
  });

  it('masks every pile in playerView but keeps counts and the center readable', () => {
    const view = ratscrewGame.playerView(state({ center: ['H5'] }), 1);
    expect(view.piles[0]).toHaveLength(2);    expect(view.piles[0]?.[0]).toBe('??');
    expect(view.piles[1]?.[0]).toBe('??');
    expect(view.center).toEqual(['H5']);
  });

  it('runs bot-only matches to completion across seeds and seat counts', () => {
    for (const seats of [2, 3, 4]) {
      for (let seed = 0; seed < 8; seed++) {
        const record = runBotGame(ratscrewGame, {
          seed: seed * 31 + seats,
          policies: Array.from({ length: seats }, () => ratscrewGame.bots[0]),
        });
        expect(record.result?.winner).not.toBeNull();
        expect(record.events).toBeGreaterThan(seats);
      }
    }
  });

  it('rejects out-of-turn flips and illegal seats', () => {
    const session = createSession(ratscrewGame, { seed: 1, config: defaults(), seats: 2 });
    expect(sessionApply(ratscrewGame, session, 1, 'flip').rejected?.code).toBe('not-your-turn');
  });
});

describe('config & contract', () => {
  it('resolves presets over defaults', () => {
    expect(applyPreset(ratscrewConfigSchema, 'quick-reflex')).toMatchObject({ slapWindowMs: 700 });
    expect(applyPreset(ratscrewConfigSchema, 'slaphappy')).toMatchObject({ tens: true });
    expect(defaults()).toMatchObject({ doubles: true, sandwiches: true, tens: false, slapWindowMs: 1200 });
  });

  it('ships full instructions and a stable id', () => {
    expect(ratscrewGame.id).toBe('ratscrew');
    expect(ratscrewGame.howToPlay.sections.length).toBeGreaterThan(3);
    expect(ratscrewGame.howToPlay.objective.length).toBeGreaterThan(10);
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
});
