import { applyPreset, stateHash } from '@parlour/engine';
import { ratscrewGame } from '@parlour/game-ratscrew';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RatscrewTransport } from './RatscrewTransport';

/**
 * Solo transport tests run on a virtual clock: `now` is a test-controlled
 * counter so bot reflexes and window closes can be driven deterministically.
 */

describe('ratscrew solo transport (virtual clock)', () => {
  let nowMs: number;
  let advance: (ms: number) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    nowMs = 1_000_000;
    advance = (ms) => {
      nowMs += ms;
      vi.advanceTimersByTime(ms);
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function make(overrides?: { seed?: number; slapWindowMs?: number }) {
    return new RatscrewTransport({
      seats: 2,
      seed: overrides?.seed ?? 77,
      rules: ratscrewGame.configSchema.resolve({ slapWindowMs: overrides?.slapWindowMs ?? 400 }),
      player: { name: 'You', avatarId: 'ember' },
      now: () => nowMs,
    });
  }

  it('deals deterministically per seed and offers the human a flip', () => {
    const a = make({ seed: 5 });
    const b = make({ seed: 5 });
    expect(stateHash(a.getSnapshot().session.state)).toBe(stateHash(b.getSnapshot().session.state));
    const legal = a.legalMoves();
    expect(legal.map((move) => move.id)).toEqual(['flip', 'slap']);
    a.dispose();
    b.dispose();
  });

  it('bots flip on their own reflexes while the human waits', () => {
    const transport = make();
    const before = transport.getSnapshot().session.log.length;
    // seat 0 flips immediately, then bots take their turns as timers fire
    transport.dispatch('flip');
    advance(1_000);
    expect(transport.getSnapshot().session.log.length).toBeGreaterThan(before + 0);
    const turn = transport.getSnapshot().session.state.turn;
    expect(turn === 0 || transport.getSnapshot().session.state.center.length > 0).toBe(true);
    transport.dispose();
  });

  it('lets the human slap a live window and win the pile', () => {
    const transport = make();
    let humanSlapped = false;
    for (let step = 0; step < 400; step++) {
      const snap = transport.getSnapshot();
      if (snap.session.status !== 'playing') break;
      if (snap.session.state.window && !humanSlapped) {
        const outcome = transport.dispatch('slap');
        expect(outcome.rejected).toBeNull();
        humanSlapped = true;
        break;
      }
      if (snap.session.state.turn === 0) {
        expect(transport.dispatch('flip').rejected).toBeNull();
      }
      advance(120);
    }
    expect(humanSlapped).toBe(true);
    transport.dispose();
  });

  it('burns the human’s top card on a risk slap with no pattern live', () => {
    const transport = make();
    const state = () => transport.getSnapshot().session.state;
    if (state().turn !== 0) throw new Error('fixture expects seat 0 to lead');
    const stackBefore = state().piles[0]!.length;
    const centerBefore = state().center.length;
    const outcome = transport.dispatch('slap');
    expect(outcome.rejected).toBeNull();
    expect(state().piles[0]!.length).toBe(stackBefore - 1);
    expect(state().center.length).toBe(centerBefore + 1);
    transport.dispose();
  });

  it('injects windowClose after slapWindowMs plus the fairness grace', () => {
    const transport = make({ slapWindowMs: 400 });
    let openedAtLogLength: number | null = null;
    let sawWindow = false;
    for (let step = 0; step < 500; step++) {
      const snap = transport.getSnapshot();
      if (snap.session.status !== 'playing') break;
      if (snap.session.state.window) {
        sawWindow = true;
        openedAtLogLength = snap.session.log.length;
        break;
      }
      if (snap.session.state.turn === 0) transport.dispatch('flip');
      advance(100);
    }
    expect(sawWindow).toBe(true);

    // nobody slaps: the authority closes the race itself
    advance(400 + 150 + 50);
    const snap = transport.getSnapshot();
    expect(snap.session.log.length).toBeGreaterThan(openedAtLogLength!);
    expect(snap.session.state.window).toBeNull();
    transport.dispose();
  });

  it('stops scheduling once disposed', () => {
    const transport = make();
    transport.dispatch('flip');
    transport.dispose();
    const logLength = transport.getSnapshot().session.log.length;
    advance(10_000);
    expect(transport.getSnapshot().session.log.length).toBe(logLength);
  });

  it('plays a long mixed stretch without stalling the flow', () => {
    const transport = make({ seed: 1234 });
    // drive seat 0 like a player; bots race on their own timers throughout
    for (let step = 0; step < 600; step++) {
      advance(200);
      if (transport.getSnapshot().session.status === 'ended') break;
      if (
        transport.getSnapshot().session.status === 'playing' &&
        transport.getSnapshot().session.state.turn === 0 &&
        !transport.getSnapshot().session.state.window
      ) {
        transport.dispatch('flip');
      }
    }
    expect(transport.getSnapshot().session.log.length).toBeGreaterThan(40);
    transport.dispose();
  });

  it('derives its mode from the resolved rules', () => {
    const transport = new RatscrewTransport({
      seats: 3,
      seed: 9,
      rules: applyPreset(ratscrewGame.configSchema, 'slaphappy'),
      player: { name: 'You', avatarId: 'ember' },
      now: () => nowMs,
    });
    expect(transport.getSnapshot().mode).toBe('slaphappy');
    transport.dispose();
  });
});
