import { describe, expect, it } from 'vitest';
import { Fx, type Rng } from '@parlour/engine';
import { captureOptions, sumCombinations } from './capture';
import { scopaConfig } from './config';
import { GAME_ID, ScopaFx, createScopaDef } from './game';
import { makeCtx, makeState, mustStep, openSession, step } from './test-util';

const DECK_IDS = ['D', 'C', 'S', 'B'].flatMap((suit) =>
  Array.from({ length: 10 }, (_, rank) => `${suit}${rank + 1}`),
);

const def = createScopaDef();
const playMove = def.moves.playCard!;

function kings(cards: readonly string[]): number {
  return cards.filter((card) => card.endsWith('10')).length;
}

/** Rng stub feeding setup a scripted sequence of shuffles (tests are exempt). */
class ScriptedRng {
  readonly calls: string[] = [];
  constructor(private readonly shuffles: string[][]) {}
  int(): number {
    return 0;
  }
  float(): number {
    return 0;
  }
  shuffle<T>(items: readonly T[]): T[] {
    const order = this.shuffles[this.calls.length];
    this.calls.push('shuffle');
    return [...(order ?? items)] as T[];
  }
  pick<T>(items: readonly T[]): T {
    return items[0] as T;
  }
  fork(): ScriptedRng {
    return this;
  }
  getState(): unknown {
    return null;
  }
  setState(): void {}
}

describe('setup', () => {
  it('deals 4 to the table, 3 to each hand and keeps the rest as stock', () => {
    const session = openSession({ seed: 42 });
    const state = session.state;
    expect(GAME_ID).toBe('scopa');
    expect(state.table).toHaveLength(4);
    state.hands.forEach((hand) => expect(hand).toHaveLength(3));
    expect(state.stock).toHaveLength(30);
    const all = [...state.table, ...state.hands.flat(), ...state.stock];
    expect(new Set(all).size).toBe(40);
    expect(kings(state.table)).toBeLessThan(3);
    expect(session.phase.phase).toBe('playing');
    expect(state.turn).toBe(1); // left of the dealer
  });

  it('refuses unsupported table sizes', () => {
    expect(() => openSession({ seats: 5 })).toThrow(/2, 3, 4 or 6 seats/);
  });

  it('deals scopone whole-deck style with no stock', () => {
    for (const [seats, perHand] of [
      [2, 18],
      [3, 12],
      [4, 9],
      [6, 6],
    ] as const) {
      const session = openSession({ seed: 5 + seats, config: { scopone: true }, seats });
      expect(session.state.stock).toHaveLength(0);
      session.state.hands.forEach((hand) => expect(hand).toHaveLength(perHand));
      expect(session.state.table).toHaveLength(4);
      expect(kings(session.state.table)).toBeLessThan(3);
    }
  });

  it('is deterministic per seed and emits a staggered opening deal', () => {
    const a = openSession({ seed: 99 });
    const b = openSession({ seed: 99 });
    expect(a.state.hands).toEqual(b.state.hands);
    expect(a.state.table).toEqual(b.state.table);
    const deal = a.setupFx!.filter((event) => event.kind === Fx.DealCard);
    expect(deal).toHaveLength(6); // 2 seats × 3 cards
    expect(deal[1]!.at).toBeGreaterThan(0);
  });

  it('redeals when a shuffle would open with three or more kings', () => {
    // a king-heavy opening order followed by a clean one: the accepted layout
    // must come from the SECOND shuffle, and only the second may emit fx
    const heavy = ['D10', 'C10', 'S10', 'B7'];
    const kingHeavy = [...heavy, ...DECK_IDS.filter((id) => !heavy.includes(id))];
    const scripted = new ScriptedRng([kingHeavy, [...DECK_IDS]]);
    const rng = scripted as unknown as Rng;
    const { fx } = makeCtx();

    const state = def.setup({ config: scopaConfig.resolve({}), seats: 2, rng, fx });

    expect(kings(state.table)).toBeLessThan(3);
    expect(state.hands.flat().length + state.stock.length).toBe(36);
    expect(scripted.calls.filter((call) => call === 'shuffle')).toHaveLength(2); // the redeal fired
  });

  it('never deals a king-heavy tableau across ordinary seeds either', () => {
    let checked = 0;
    for (let seed = 0; seed < 120; seed++) {
      const session = openSession({ seed, seats: 4 });
      expect(kings(session.state.table)).toBeLessThan(3);
      checked += 1;
    }
    expect(checked).toBe(120);
  });
});

describe('capture enumeration and forcing', () => {
  const fault = (verdict: true | { code: string; message: string }): string | null =>
    verdict === true ? null : verdict.code;

  it('forces a single-card capture and refuses pose or sum alternatives', () => {
    // mid-round: seat 1 still holds a card and stock remains — not the final play
    const state = makeState({
      hands: [['D5'], ['C8']],
      stock: ['S1'],
      table: ['C2', 'S3', 'B5'],
    });

    expect(playMove.validate(state, 0, { card: 'D5' })).toEqual({
      code: 'capture-forced',
      message: 'a single-card capture is available',
    });
    // the sum 2+3=5 exists on the table but is not on offer — singleton is forced
    expect(playMove.validate(state, 0, { card: 'D5', take: ['C2', 'S3'] })).toEqual({
      code: 'capture-forced',
      message: 'a single-card capture is available',
    });

    const applied = playMove.apply(state, 0, { card: 'D5', take: ['B5'] }, makeCtx().ctx);
    expect(applied.table).toEqual(['C2', 'S3']);
    expect(applied.captures[0]).toContain('B5');
    expect(applied.captures[0]).toContain('D5');
    expect(applied.scope).toEqual([0, 0]); // two cards remain on the table
  });

  it('surfaces multiple identical singletons as distinct legal moves', () => {
    const state = makeState({
      hands: [['D5'], ['C1']],
      stock: ['S9'],
      table: ['C5', 'S5', 'B2'],
    });
    expect(captureOptions(['D5'], state.table)).toEqual([
      { card: 'D5', take: ['C5'] },
      { card: 'D5', take: ['S5'] },
    ]);

    const left = playMove.apply(state, 0, { card: 'D5', take: ['C5'] }, makeCtx().ctx);
    expect(left.table).toEqual(['S5', 'B2']);
    const right = playMove.apply(state, 0, { card: 'D5', take: ['S5'] }, makeCtx().ctx);
    expect(right.table).toEqual(['C5', 'B2']);
  });

  it('offers sums as optional choices alongside posing when no singleton matches', () => {
    const state = makeState({ hands: [['D4'], ['C7']], stock: ['B1'], table: ['C1', 'S3'] });
    expect(captureOptions(['D4'], state.table)).toEqual([
      { card: 'D4', take: ['C1', 'S3'] },
      { card: 'D4', take: [] },
    ]);

    const posed = playMove.apply(state, 0, { card: 'D4' }, makeCtx().ctx);
    expect(posed.table).toEqual(['C1', 'S3', 'D4']);
    expect(posed.captures[0]).toEqual([]);

    const taken = playMove.apply(state, 0, { card: 'D4', take: ['C1', 'S3'] }, makeCtx().ctx);
    expect(taken.table).toEqual([]);
    expect(taken.scope).toEqual([1, 0]); // a mid-round clear is exactly what a scopa is
  });

  it('rejects takes that do not sum, name foreign cards, or duplicate', () => {
    const state = makeState({ hands: [['D7'], []], stock: [], table: ['C2', 'S3'] });
    expect(fault(playMove.validate(state, 0, { card: 'D7', take: ['C2'] }))).toBe('bad-capture');
    expect(fault(playMove.validate(state, 0, { card: 'D7', take: ['C2', 'B9'] }))).toBe(
      'bad-capture',
    );
    expect(fault(playMove.validate(state, 0, { card: 'D7', take: ['C2', 'C2'] }))).toBe(
      'bad-capture',
    );
    expect(fault(playMove.validate(state, 0, { card: 'C2' }))).toBe('not-in-hand');
    expect(fault(playMove.validate(state, 0, { card: 'D7', take: 'C2' }))).toBe('bad-play');
    expect(fault(playMove.validate(makeState(), 1, { card: 'D1' }))).toBe('not-your-turn');
  });

  it('enumerates multi-card sums completely and without singletons', () => {
    const table = ['C1', 'S2', 'B3', 'D4', 'S5', 'B10'];
    expect(sumCombinations(10, table)).toEqual([
      ['C1', 'D4', 'S5'],
      ['S2', 'B3', 'S5'],
      ['C1', 'S2', 'B3', 'D4'],
    ]);
    expect(sumCombinations(11, table)).toEqual([
      ['C1', 'B10'],
      ['S2', 'D4', 'S5'],
      ['C1', 'S2', 'B3', 'S5'],
    ]);
    expect(sumCombinations(10, ['B10'])).toEqual([]); // singletons are not sums
  });
});

describe('scopa and the final sweep', () => {
  it('scores a scopa for clearing the table mid-round', () => {
    const state = makeState({
      hands: [['D5'], ['C1']],
      stock: ['S1', 'B2', 'D3', 'C4'],
      table: ['C5'],
      turn: 0,
    });
    const { ctx, fx } = makeCtx();
    const applied = playMove.apply(state, 0, { card: 'D5', take: ['C5'] }, ctx);
    expect(applied.table).toEqual([]);
    expect(applied.scope).toEqual([1, 0]);
    expect(fx.events.some((event) => event.kind === ScopaFx.Scopa)).toBe(true);
    expect(fx.events.some((event) => event.kind === ScopaFx.Capture)).toBe(true);
    expect(fx.events.some((event) => event.kind === Fx.TurnRing)).toBe(true);
  });

  it('does NOT score a scopa on the last card of the final deal', () => {
    const state = makeState({ hands: [['D5'], []], stock: [], table: ['C5'], turn: 0 });
    const { ctx, fx } = makeCtx();
    const applied = playMove.apply(state, 0, { card: 'D5', take: ['C5'] }, ctx);
    expect(applied.table).toEqual([]); // still captured…
    expect(applied.captures[0]).toContain('C5');
    expect(applied.scope).toEqual([0, 0]); // …but worth no scopa point
    expect(fx.events.some((event) => event.kind === ScopaFx.Scopa)).toBe(false);
  });

  it('sweeps remaining table cards to the last capturer — not a scopa', () => {
    const state = makeState({
      hands: [['D9'], []],
      stock: [],
      table: ['C2', 'S3', 'B4'],
      captures: [[], ['C7']],
      lastCapturer: 1,
      turn: 0,
    });
    const { ctx, fx } = makeCtx();
    const applied = playMove.apply(state, 0, { card: 'D9' }, ctx);
    expect(applied.table).toEqual([]); // swept clean even though seat 0 posed
    expect(applied.lastCapturer).toBe(1);
    expect(applied.captures[1]).toEqual(['C7', 'C2', 'S3', 'B4', 'D9']);
    expect(applied.scope).toEqual([0, 0]);
    expect(fx.events.some((event) => event.kind === ScopaFx.Sweep)).toBe(true);
    expect(fx.events.some((event) => event.kind === ScopaFx.Scopa)).toBe(false);
  });

  it('emits exactly one collect-or-pose event plus the ring per play', () => {
    const { ctx, fx } = makeCtx();
    playMove.apply(makeState({ hands: [['D1'], []], table: ['C2'] }), 0, { card: 'D1' }, ctx);
    const kinds = fx.events.map((event) => event.kind);
    expect(kinds.filter((kind) => kind === ScopaFx.Pose)).toHaveLength(1);
    expect(kinds).not.toContain(ScopaFx.Capture);
    expect(kinds).toContain(Fx.TurnRing);
  });
});

describe('turn flow through the runtime', () => {
  function pickLegal(session: ReturnType<typeof openSession>): { card: string; take?: string[] } {
    const moves = def.flow.legalMovesFor?.(session.state, session.phase, session.state.turn) ?? [];
    const first = moves[0];
    if (!first?.payload) throw new Error('no legal play available');
    return first.payload as { card: string; take?: string[] };
  }

  it('rotates turns and auto-deals three fresh cards when hands empty out', () => {
    let session = openSession({ seed: 11 });
    expect(session.state.turn).toBe(1);
    for (let play = 0; play < 6; play++) {
      session = mustStep(session, session.state.turn, 'playCard', pickLegal(session));
    }
    // six plays emptied both hands; settle chained the stock deal inside the last step
    session.state.hands.forEach((hand) => expect(hand).toHaveLength(3));
    expect(session.state.stock).toHaveLength(24);
    expect(session.state.table.length).toBeGreaterThan(0);
  });

  it('sweeps, scores, posts a summary and rolls into round two in one settle', () => {
    let session = openSession({ seed: 21 });
    let guard = 0;
    while (
      session.status === 'playing' &&
      session.state.roundNo === 1 &&
      session.state.stage === 'playing' &&
      guard++ < 40
    ) {
      session = mustStep(session, session.state.turn, 'playCard', pickLegal(session));
    }
    expect(guard).toBeLessThanOrEqual(40);
    expect(session.status).toBe('playing');
    expect(session.state.roundNo).toBe(2);
    expect(session.state.summary).toBeNull(); // cleared for the new round
    expect(session.state.lastRound).not.toBeNull();
    expect(session.state.lastRound!.cardsBySeat.reduce((a, b) => a + b, 0)).toBe(40);
    expect(session.state.scores.some((score) => score > 0)).toBe(true);
    expect(session.state.hands.every((hand) => hand.length > 0)).toBe(true);
  });

  it('rejects out-of-turn and unknown moves', () => {
    const session = openSession({ seed: 31 });
    const turnPayload = pickLegal(session);
    const other = (session.state.turn + 1) % 2;
    expect(step(session, other, 'playCard', turnPayload).rejected).toBe('not-your-turn');
    expect(step(session, session.state.turn, 'nope').rejected).toBe('illegal-move');
    // system moves exist but flow never offers them to a seat
    expect(step(session, session.state.turn, 'finishRound').rejected).toBe('illegal-move');
  });
});
