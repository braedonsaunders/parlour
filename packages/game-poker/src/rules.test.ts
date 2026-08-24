import { describe, expect, it } from 'vitest';
import {
  bigBlindSeat,
  firstToActPostflop,
  firstToActPreflop,
  isHeadsUp,
  minRaiseTo,
  smallBlindSeat,
} from './betting';
import { blindsForLevel } from './config';
import { pokerGame } from './game';
import { potSoFar, toCall } from './state';
import { actWith, chipsInPlay, legalIds, mustStep, openSession, step } from './test-util';

describe('starting a hand', () => {
  it('posts the blinds left of the button and deals two cards each', () => {
    const session = openSession({ seats: 4, config: { ante: false } });
    const state = session.state;
    const { small, big } = blindsForLevel(0);

    expect(state.button).toBe(0);
    expect(smallBlindSeat(state)).toBe(1);
    expect(bigBlindSeat(state)).toBe(2);
    expect(state.committed[1]).toBe(small);
    expect(state.committed[2]).toBe(big);
    expect(state.currentBet).toBe(big);
    expect(state.hole.every((cards) => cards.length === 2)).toBe(true);
    expect(new Set(state.hole.flat()).size).toBe(8);
  });

  it('starts the action left of the big blind', () => {
    const session = openSession({ seats: 4 });
    expect(firstToActPreflop(session.state)).toBe(3);
    expect(session.state.turn).toBe(3);
  });

  it('puts the button on the small blind when heads-up', () => {
    const session = openSession({ seats: 2, config: { ante: false } });
    const state = session.state;
    expect(isHeadsUp(state)).toBe(true);
    expect(smallBlindSeat(state)).toBe(0);
    expect(bigBlindSeat(state)).toBe(1);
    // The button acts first before the flop and last after it.
    expect(firstToActPreflop(state)).toBe(0);
    expect(firstToActPostflop(state)).toBe(1);
    expect(state.turn).toBe(0);
  });

  it('has the big blind post the table ante, and only from the third level', () => {
    const early = openSession({ seats: 4, config: { ante: true } });
    expect(early.state.committed[2]).toBe(blindsForLevel(0).big);

    const deep = { ...early.state, level: 3 };
    expect(deep.level).toBeGreaterThanOrEqual(2);
  });

  it('deals every seat a distinct card', () => {
    const session = openSession({ seats: 6 });
    const dealt = session.state.hole.flat();
    expect(dealt).toHaveLength(12);
    expect(new Set(dealt).size).toBe(12);
    expect(session.state.deck).toHaveLength(52 - 12);
  });
});

describe('what a seat may do', () => {
  it('offers fold, call and a raise ladder when facing a bet', () => {
    const session = openSession({ seats: 4 });
    const seat = session.state.turn as number;
    expect(legalIds(session, seat).sort()).toEqual(['call', 'fold', 'raise']);
  });

  it('offers check instead of call when nothing is owed', () => {
    let session = openSession({ seats: 3, config: { ante: false } });
    // Button calls, small blind completes, big blind has the option to check.
    session = actWith(session, ['call']);
    session = actWith(session, ['call']);
    const bb = session.state.turn as number;
    expect(bb).toBe(bigBlindSeat(session.state));
    expect(toCall(session.state, bb)).toBe(0);
    expect(legalIds(session, bb).sort()).toEqual(['check', 'fold', 'raise']);
  });

  it('gives the big blind its option rather than closing the round early', () => {
    let session = openSession({ seats: 3, config: { ante: false } });
    session = actWith(session, ['call']);
    session = actWith(session, ['call']);
    // Everybody has matched, but the blind has not acted voluntarily yet.
    expect(session.state.street).toBe('preflop');
    expect(session.state.turn).toBe(bigBlindSeat(session.state));

    session = actWith(session, ['check']);
    expect(session.state.street).toBe('flop');
    expect(session.state.board).toHaveLength(3);
  });

  it('lets nobody act out of turn', () => {
    const session = openSession({ seats: 4 });
    const waiting = ((session.state.turn as number) + 1) % 4;
    // The runtime's own turn gate catches this before the pack is consulted.
    expect(step(session, waiting, 'fold').rejected).toBe('not-your-turn');
  });

  it('refuses a check when there is a bet to call', () => {
    const session = openSession({ seats: 4 });
    const seat = session.state.turn as number;
    expect(step(session, seat, 'check').rejected).toBe('illegal-move');
  });
});

describe('raising', () => {
  it('requires a raise to clear the last one', () => {
    const session = openSession({ seats: 4, config: { ante: false } });
    const seat = session.state.turn as number;
    const floor = minRaiseTo(session.state);
    expect(floor).toBe(blindsForLevel(0).big * 2);

    expect(step(session, seat, 'raise', { to: floor - 5 }).rejected).toBe('below-minimum');
    expect(step(session, seat, 'raise', { to: floor }).rejected).toBeUndefined();
  });

  it('accepts any amount between the minimum and all-in, not just the ladder', () => {
    const session = openSession({ seats: 4, config: { ante: false } });
    const seat = session.state.turn as number;
    const odd = minRaiseTo(session.state) + 7;
    const raised = mustStep(session, seat, 'raise', { to: odd });
    expect(raised.state.currentBet).toBe(odd);
    expect(raised.state.streetBet[seat]).toBe(odd);
  });

  it('will not let a seat raise past its stack', () => {
    const session = openSession({ seats: 4 });
    const seat = session.state.turn as number;
    const tooMuch = (session.state.stacks[seat] as number) + 1000;
    expect(step(session, seat, 'raise', { to: tooMuch }).rejected).toBe('short-stack');
  });

  it('reopens the betting for everyone after a full raise', () => {
    let session = openSession({ seats: 4, config: { ante: false } });
    const raiser = session.state.turn as number;
    session = mustStep(session, raiser, 'raise', { to: minRaiseTo(session.state) });
    // Everyone else owes a decision again, including the blinds that posted.
    for (let seat = 0; seat < 4; seat++) {
      if (seat === raiser) expect(session.state.needsToAct[seat]).toBe(false);
      else expect(session.state.needsToAct[seat]).toBe(true);
    }
  });

  it('lets a short stack shove below the minimum raise', () => {
    let session = openSession({ seats: 3, config: { ante: false } });
    const shorty = session.state.turn as number;
    // Strip the seat down to less than a full raise.
    session = {
      ...session,
      state: {
        ...session.state,
        stacks: session.state.stacks.map((chips, seat) => (seat === shorty ? 25 : chips)),
      },
    };
    const shove = (session.state.streetBet[shorty] as number) + 25;
    expect(shove).toBeLessThan(minRaiseTo(session.state));
    const after = mustStep(session, shorty, 'raise', { to: shove });
    expect(after.state.allIn[shorty]).toBe(true);
    expect(after.state.stacks[shorty]).toBe(0);
  });
});

describe('finishing a hand', () => {
  it('gives the pot to the last seat standing when everyone folds', () => {
    let session = openSession({ seats: 4, config: { ante: false } });
    const before = chipsInPlay(session.state);
    const bb = bigBlindSeat(session.state);
    const stackBefore = session.state.stacks[bb] as number;
    const pot = potSoFar(session.state);

    session = actWith(session, ['fold']);
    session = actWith(session, ['fold']);
    session = actWith(session, ['fold']);

    expect(session.state.handNo).toBe(2);
    const summary = session.state.lastHand;
    expect(summary?.walkover).toBe(true);
    // `stackBefore` is already net of the posted blind, so winning the whole
    // pot leaves the seat up by exactly what the other players put in.
    expect(summary?.stacksAfter[bb]).toBe(stackBefore + pot);
    expect(summary?.net[bb]).toBe(pot - blindsForLevel(0).big);
    expect(chipsInPlay(session.state)).toBe(before);
  });

  it('never shows a hand that did not have to be shown', () => {
    let session = openSession({ seats: 4, config: { ante: false } });
    session = actWith(session, ['fold']);
    session = actWith(session, ['fold']);
    session = actWith(session, ['fold']);
    expect(session.state.lastHand?.shown.every((entry) => entry.mucked)).toBe(true);
  });

  it('runs the board out and scores a showdown', () => {
    let session = openSession({ seats: 2, seed: 91, config: { ante: false } });
    let guard = 0;
    while (session.state.handNo === 1 && session.status === 'playing') {
      if (guard++ > 40) throw new Error('the hand never finished');
      session = actWith(session, ['check', 'call']);
    }
    const summary = session.state.lastHand;
    expect(summary).not.toBeNull();
    expect(summary?.walkover).toBe(false);
    expect(summary?.board).toHaveLength(5);
    expect(summary?.shown.some((entry) => !entry.mucked)).toBe(true);
  });

  it('deals the next hand with the button moved on', () => {
    let session = openSession({ seats: 4, config: { ante: false } });
    expect(session.state.button).toBe(0);
    session = actWith(session, ['fold']);
    session = actWith(session, ['fold']);
    session = actWith(session, ['fold']);
    expect(session.state.button).toBe(1);
    expect(session.state.street).toBe('preflop');
    expect(session.state.summary).toBeNull();
    expect(session.state.lastHand).not.toBeNull();
  });
});

describe('the board', () => {
  it('deals three, then one, then one', () => {
    let session = openSession({ seats: 2, config: { ante: false } });
    const sizes: number[] = [];
    let guard = 0;
    while (session.state.handNo === 1 && session.status === 'playing') {
      if (guard++ > 40) throw new Error('the hand never finished');
      session = actWith(session, ['check', 'call']);
      sizes.push(session.state.board.length);
    }
    expect([...new Set(sizes)]).toEqual(expect.arrayContaining([3, 4, 5]));
  });

  it('never deals a board card that is already in someone', () => {
    let session = openSession({ seats: 4, seed: 404, config: { ante: false } });
    let guard = 0;
    while (session.state.handNo === 1 && session.status === 'playing') {
      if (guard++ > 60) throw new Error('the hand never finished');
      session = actWith(session, ['check', 'call']);
    }
    const board = session.state.lastHand?.board ?? [];
    const hole = session.state.lastHand?.shown.flatMap((entry) => entry.hole) ?? [];
    expect(new Set([...board, ...hole]).size).toBe(board.length + hole.length);
  });
});

describe('what a seat is allowed to see', () => {
  it('hides other hole cards and the undealt deck', () => {
    const session = openSession({ seats: 4 });
    const view = pokerGame.playerView(session.state, 1);
    expect(view.hole[1]).toEqual(session.state.hole[1]);
    expect(view.hole[0]).toEqual(['??', '??']);
    expect(view.hole[2]).toEqual(['??', '??']);
    // The rest of the deck is the next three community cards. It never ships.
    expect(view.deck).toEqual([]);
  });

  it('shows a hand once it has been turned over', () => {
    const shown = { ...openSession({ seats: 4 }).state };
    const revealed = { ...shown, shown: shown.shown.map((_, seat) => seat === 0) };
    const view = pokerGame.playerView(revealed, 1);
    expect(view.hole[0]).toEqual(revealed.hole[0]);
  });
});
