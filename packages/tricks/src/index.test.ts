import { describe, expect, it } from 'vitest';
import {
  emitTrickCollect,
  emitTrickPlay,
  followError,
  faceRules,
  hasSuit,
  isTrickComplete,
  legalFollows,
  openTrick,
  playToTrick,
  resolveTrickWinner,
  TrickFx,
  trickCards,
  trickOrder,
  trickPlaysNeeded,
  type TrickRules,
} from './index';
import { stdDeck, type FxEmitter } from '@parlour/engine';

const std = faceRules(stdDeck().faces);

/** Tiny synthetic deck: '3h' = rank 3 hearts, '9s' = rank 9 spades, else unknown. */
const suitRank: TrickRules = {
  suitOf: (card) => (card.endsWith('h') ? 'hearts' : card.endsWith('s') ? 'spades' : null),
  rankOf: (card) => Number(card.slice(0, -1)),
};

describe('trickOrder', () => {
  it('walks clockwise from the leader', () => {
    expect(trickOrder(0, 4)).toEqual([0, 1, 2, 3]);
    expect(trickOrder(2, 4)).toEqual([2, 3, 0, 1]);
  });

  it('handles two seats and wraps', () => {
    expect(trickOrder(1, 2)).toEqual([1, 0]);
    expect(trickOrder(5, 3)).toEqual([2, 0, 1]);
  });

  it('is empty for zero seats', () => {
    expect(trickOrder(0, 0)).toEqual([]);
  });
});

describe('trickPlaysNeeded / isTrickComplete', () => {
  it('needs one play per seat', () => {
    expect(trickPlaysNeeded(4)).toBe(4);
    expect(trickPlaysNeeded(3)).toBe(3);
  });

  it('completes only when every seat has played', () => {
    let trick = openTrick(0);
    for (const seat of [0, 1, 2]) {
      expect(isTrickComplete(trick, 4)).toBe(false);
      trick = playToTrick(trick, seat, `${seat}h`, suitRank);
    }
    trick = playToTrick(trick, 3, '3h', suitRank);
    expect(isTrickComplete(trick, 4)).toBe(true);
  });

  it('completes immediately on a one-seat table once a card lands', () => {
    const trick = playToTrick(openTrick(0), 0, '1h', suitRank);
    expect(isTrickComplete(trick, 1)).toBe(true);
    expect(isTrickComplete(openTrick(0), 1)).toBe(false);
  });
});

describe('playToTrick', () => {
  const letterRules: TrickRules = { suitOf: (card) => card[0] ?? null, rankOf: () => 1 };

  it('sets ledSuit from the first card only', () => {
    let trick = openTrick(0);
    expect(trick.ledSuit).toBeNull();
    trick = playToTrick(trick, 0, 'hearts', letterRules);
    expect(trick.ledSuit).toBe('h');
    trick = playToTrick(trick, 1, 'spades', letterRules);
    expect(trick.ledSuit).toBe('h');
  });

  it('keeps plays in order and preserves the leader', () => {
    let trick = openTrick(3);
    for (const seat of [3, 0]) trick = playToTrick(trick, seat, `${seat}h`, suitRank);
    expect(trick.leader).toBe(3);
    expect(trick.plays.map((play) => play.seat)).toEqual([3, 0]);
  });
});

describe('followError', () => {
  it('allows following suit', () => {
    expect(followError({ ledSuit: 'hearts', hand: ['H7'], card: 'H2' }, std)).toBeNull();
  });

  it('rejects off-suit while holding the led suit', () => {
    expect(followError({ ledSuit: 'hearts', hand: ['H7'], card: 'S2' }, std)).toBe(
      'must-follow-suit',
    );
  });

  it('allows any card from a void hand', () => {
    expect(followError({ ledSuit: 'hearts', hand: ['S2', 'D9'], card: 'S13' }, std)).toBeNull();
  });
});

describe('hasSuit / legalFollows', () => {
  it('detects suit presence', () => {
    expect(hasSuit(['H2', 'S9'], std, 'hearts')).toBe(true);
    expect(hasSuit(['H2', 'S9'], std, 'diamonds')).toBe(false);
  });

  it('narrows to the led suit when held', () => {
    expect(legalFollows(['H2', 'S9', 'H13'], 'hearts', std)).toEqual(['H2', 'H13']);
  });

  it('returns the whole hand when void', () => {
    expect(legalFollows(['S9', 'D14'], 'clubs', std)).toEqual(['S9', 'D14']);
  });
});

describe('resolveTrickWinner', () => {
  it('gives an untumped trick to the highest led-suit card', () => {
    let trick = openTrick(0);
    trick = playToTrick(trick, 0, 'H5', std);
    trick = playToTrick(trick, 1, 'H12', std);
    trick = playToTrick(trick, 2, 'S13', std);
    trick = playToTrick(trick, 3, 'H2', std);
    expect(resolveTrickWinner(trick, std)).toBe(1);
  });

  it('ignores off-suit ranks entirely', () => {
    let trick = openTrick(1);
    trick = playToTrick(trick, 1, 'C4', std);
    trick = playToTrick(trick, 2, 'D13', std);
    trick = playToTrick(trick, 3, 'S14', std);
    trick = playToTrick(trick, 0, 'C3', std);
    expect(resolveTrickWinner(trick, std)).toBe(1);
  });

  it('hands the trick to a trump over the led suit', () => {
    let trick = openTrick(0);
    trick = playToTrick(trick, 0, 'H13', std);
    trick = playToTrick(trick, 1, 'S3', std);
    expect(resolveTrickWinner(trick, { ...std, trumpSuit: 'spades' })).toBe(1);
  });

  it('prefers the highest trump when several land', () => {
    let trick = openTrick(0);
    trick = playToTrick(trick, 0, 'S5', std);
    trick = playToTrick(trick, 1, 'S11', std);
    trick = playToTrick(trick, 2, 'H13', std);
    trick = playToTrick(trick, 3, 'S2', std);
    expect(resolveTrickWinner(trick, { ...std, trumpSuit: 'spades' })).toBe(1);
  });

  it('stays with the highest led card when no trump landed', () => {
    let trick = openTrick(2);
    trick = playToTrick(trick, 2, 'D6', std);
    trick = playToTrick(trick, 3, 'D12', std);
    expect(resolveTrickWinner(trick, { ...std, trumpSuit: null })).toBe(3);
  });

  it('honors effectiveSuit remaps before comparing', () => {
    // Euchre-flavored: J♦ counts as a heart AND outranks them (left bower).
    const euchreish: TrickRules = {
      ...std,
      rankOf: (card) => (card === 'D11' ? 14 : std.rankOf(card)),
      effectiveSuit: (card) => (card === 'D11' ? 'hearts' : (std.suitOf(card) as string)),
      trumpSuit: 'hearts',
    };
    let trick = openTrick(0);
    trick = playToTrick(trick, 0, 'H12', std);
    trick = playToTrick(trick, 1, 'D11', std);
    expect(resolveTrickWinner(trick, euchreish)).toBe(1);
  });

  it('returns null for an empty trick', () => {
    expect(resolveTrickWinner(openTrick(0), std)).toBeNull();
  });

  it('skips unknown-suit cards instead of throwing', () => {
    let trick = openTrick(0);
    trick = playToTrick(trick, 0, 'joker', std);
    trick = playToTrick(trick, 1, 'H3', std);
    expect(resolveTrickWinner(trick, std)).toBe(1);
  });
});

describe('trickCards', () => {
  it('lists cards in play order', () => {
    let trick = openTrick(0);
    trick = playToTrick(trick, 0, 'C2', std);
    trick = playToTrick(trick, 1, 'H9', std);
    expect(trickCards(trick)).toEqual(['C2', 'H9']);
  });
});

function emitter(): FxEmitter {
  const events: Array<{ kind: string; payload?: unknown }> = [];
  return {
    events,
    emit(kind: string, payload?: unknown) {
      events.push({ kind, payload });
    },
  } as unknown as FxEmitter;
}

describe('fx hooks', () => {
  it('emits namespaced play/collect events', () => {
    const fx = emitter();
    emitTrickPlay(fx, 2, 'H5', 3);
    emitTrickCollect(fx, 2, ['H5']);
    expect(fx.events).toEqual([
      { kind: TrickFx.Play, payload: { seat: 2, card: 'H5', index: 3 } },
      { kind: TrickFx.Collect, payload: { seat: 2, cards: ['H5'], count: 1 } },
    ]);
  });
});
