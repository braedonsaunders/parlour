import { describe, expect, it } from 'vitest';
import { pinochleGame } from './rules';
import { openSession } from './test-util';

describe('playerView', () => {
  it('keeps the viewing seat’s real hand and hides everyone else', () => {
    const session = openSession({ seed: 21 });
    const view = pinochleGame.playerView(session.state, 0);
    expect(view.hands[0]).toEqual(session.state.hands[0]);
    for (const seat of [1, 2, 3]) {
      expect(view.hands[seat]).toHaveLength(session.state.hands[seat]!.length);
      expect(view.hands[seat]!.every((card) => card === '??')).toBe(true);
    }
  });

  it('never leaks another seat’s card ids anywhere in the view', () => {
    const session = openSession({ seed: 22 });
    const view = pinochleGame.playerView(session.state, 0);
    const opponentCards = new Set([1, 2, 3].flatMap((seat) => session.state.hands[seat]!));
    const serialized = JSON.stringify(view);
    for (const card of opponentCards) {
      expect(serialized.includes(card)).toBe(false);
    }
  });

  it('legalMovesFor a non-acting seat is empty', () => {
    const session = openSession({ seed: 23 });
    const idle = (session.state.turn + 1) % 4;
    const moves = pinochleGame.flow.legalMovesFor?.(session.state, session.phase, idle) ?? [];
    expect(moves).toEqual([]);
  });
});
