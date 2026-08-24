import {
  createFx,
  createSession,
  Fx,
  makeRng,
  sessionApply,
  type GameSession,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { ginConfigSchema, type GinConfig } from './config';
import { createGinHandDef } from './rules';
import { scoreHand } from './score';
import type { GinState } from './state';

const def = createGinHandDef();
const DEFAULTS = ginConfigSchema.defaults();

function freshState(partial: Partial<GinState> = {}): GinState {
  return {
    rules: DEFAULTS,
    seats: 2,
    veiled: false,
    dealer: 0,
    hands: [
      ['S3', 'S4', 'S5', 'H7', 'H8', 'H9', 'D2', 'D9', 'C6', 'C10'],
      ['C7', 'C8', 'C9', 'H2', 'H3', 'H4', 'D5', 'D10', 'S12', 'S13'],
    ],
    stock: ['C2', 'D6', 'H11', 'S8', 'C9', 'D4', 'H5', 'S13', 'C3', 'D7'],
    discard: ['S2'],
    turn: 0,
    optionSeat: null,
    passedUpcard: false,
    forceStockDraw: false,
    drawnFromStock: null,
    drawnFromDiscard: null,
    knocker: null,
    quietTurns: 0,
    pickups: [],
    outcome: null,
    ...partial,
  };
}

function codeOf(verdict: true | { code: string }): string | null {
  return verdict === true ? null : verdict.code;
}

function applyMove(state: GinState, seat: number, move: string, payload?: unknown) {
  const verdict = def.moves[move]!.validate(state, seat, payload);
  if (verdict !== true) throw new Error(`${move} rejected: ${verdict.code}`);
  const fx = createFx();
  const next = def.moves[move]!.apply(state, seat, payload, {
    rng: makeRng(1),
    fx,
    event: { seq: 0 },
  });
  return { state: next, fx: fx.events };
}

function play(
  session: GameSession<GinState, GinConfig>,
  seat: number,
  move: string,
  payload?: unknown,
) {
  const outcome = sessionApply(def, session, seat, move, payload);
  if (outcome.rejected) throw new Error(`${move} rejected: ${outcome.rejected.code}`);
  return outcome;
}

describe('deal & setup', () => {
  it('deals ten cards each plus the upcard under a fixed seed', () => {
    const session = createSession(def, { seed: 7, config: DEFAULTS, seats: 2 });
    expect(session.state.hands).toHaveLength(2);
    expect(session.state.hands[0]).toHaveLength(10);
    expect(session.state.hands[1]).toHaveLength(10);
    expect(session.state.discard).toHaveLength(1);
    expect(session.state.stock).toHaveLength(31);
    // no card appears twice
    const all = [
      ...session.state.hands[0]!,
      ...session.state.hands[1]!,
      ...session.state.discard,
      ...session.state.stock,
    ];
    expect(new Set(all).size).toBe(52);
  });

  it('seats the non-dealer for the upcard option', () => {
    const session = createSession(def, { seed: 7, config: DEFAULTS, seats: 2 });
    expect(session.state.dealer).toBe(0);
    expect(session.phase.phase).toBe('option');
    expect(session.phase.actor).toBe(1);
  });

  it('emits a staggered deal timeline with an upcard flip', () => {
    const session = createSession(def, { seed: 7, config: DEFAULTS, seats: 2 });
    const setup = session.setupFx ?? [];
    expect(setup.filter((event) => event.kind === Fx.DealCard)).toHaveLength(20);
    expect(setup.filter((event) => event.kind === Fx.FlipCard)).toHaveLength(1);
    expect(setup.map((event) => event.at ?? 0)).toEqual(
      [...setup.map((e) => e.at ?? 0)].sort((a, b) => a - b),
    );
  });
});

describe('upcard option', () => {
  it('lets the non-dealer take the upcard into their act phase', () => {
    let state = freshState({ optionSeat: 1, turn: 1 });
    const taken = state.discard[0]!;
    ({ state } = applyMove(state, 1, 'option.take'));
    expect(state.hands[1]).toContain(taken);
    expect(state.optionSeat).toBeNull();
    expect(state.drawnFromDiscard).toBe(taken);
    expect(state.pickups).toEqual([{ seat: 1, card: taken }]);
  });

  it('passes to the dealer first, then forces a stock draw after both pass', () => {
    let state = freshState({ optionSeat: 1 });
    ({ state } = applyMove(state, 1, 'option.pass'));
    expect(state.passedUpcard).toBe(true);
    expect(state.optionSeat).toBe(0);

    ({ state } = applyMove(state, 0, 'option.pass'));
    expect(state.optionSeat).toBeNull();
    expect(state.forceStockDraw).toBe(true);
    expect(state.turn).toBe(1); // non-dealer leads

    const before = state.stock.length;
    ({ state } = applyMove(state, 1, 'draw.stock'));
    expect(state.stock.length).toBe(before - 1);
    expect(state.forceStockDraw).toBe(false);
  });

  it('rejects option moves out of turn', () => {
    const state = freshState({ optionSeat: 1 });
    expect(codeOf(def.moves['option.take']!.validate(state, 0, undefined))).toBe('not-your-option');
  });
});

describe('draw / discard loop', () => {
  it('never allows discarding the stock-drawn card', () => {
    let state = freshState();
    ({ state } = applyMove(state, 0, 'draw.stock'));
    const drawn = state.drawnFromStock!;
    expect(codeOf(def.moves.discard!.validate(state, 0, { card: drawn }))).toBe('discard-locked');
  });

  it('never allows discarding the card just taken off the pile', () => {
    let state = freshState();
    ({ state } = applyMove(state, 0, 'draw.discard'));
    const taken = state.drawnFromDiscard!;
    expect(codeOf(def.moves.discard!.validate(state, 0, { card: taken }))).toBe('discard-locked');
  });

  it('advances the turn and clears draw markers on discard', () => {
    let state = freshState({ turn: 1 });
    ({ state } = applyMove(state, 1, 'draw.stock'));
    const hand = [...state.hands[1]!];
    const thrown = hand.find((card) => card !== state.drawnFromStock)!;
    const stockBefore = state.stock.length;
    const discarded = applyMove(state, 1, 'discard', { card: thrown });
    state = discarded.state;
    expect(discarded.fx.some((event) => event.kind === Fx.DiscardCard)).toBe(true);
    expect(state.turn).toBe(0);
    expect(state.discard[0]).toBe(thrown);
    expect(state.stock.length).toBe(stockBefore);
    expect(state.drawnFromStock).toBeNull();
  });

  it('records public pickups only for discard takes', () => {
    let state = freshState();
    ({ state } = applyMove(state, 0, 'draw.discard'));
    expect(state.pickups).toHaveLength(1);
    ({ state } = applyMove(state, 0, 'draw.stock'));
    expect(state.pickups).toHaveLength(1);
  });
});

describe('knock validation', () => {
  it('accepts deadwood at or below the cap', () => {
    const state = freshState({
      hands: [
        ['S3', 'S4', 'S5', 'H7', 'H8', 'H9', 'D2', 'D3', 'D4', 'D6'],
        ['C7', 'C8', 'C9'],
      ],
    });
    expect(def.moves.knock!.validate(state, 0, undefined)).toBe(true); // D6 deadwood = 6
  });

  it('rejects above-cap knocks with a clear error', () => {
    const state = freshState();
    expect(codeOf(def.moves.knock!.validate(state, 0, undefined))).toBe('deadwood-too-high');
  });

  it('honours the configured knock cap', () => {
    const tight = freshState({ rules: { ...DEFAULTS, knockCap: 5 } });
    expect(codeOf(def.moves.knock!.validate(tight, 0, undefined))).toBe('deadwood-too-high');
  });
});

describe('showdown scoring paths', () => {
  it('lays defender cards onto knocker melds before comparing', () => {
    const scored = scoreHand(
      freshState({
        knocker: 0,
        hands: [
          ['S5', 'S6', 'S7', 'H8', 'H9', 'H10', 'D2', 'D9'], // runs + 11 deadwood
          ['S4', 'S8', 'C13'], // both spades extend/fill the spade run
        ],
      }),
    );
    expect(scored.layoffs.map((layoff) => layoff.card).sort()).toEqual(['S4', 'S8']);
    expect(scored.deadwood[0]).toBe(11);
    expect(scored.deadwood[1]).toBe(10); // only the king survives
    expect(scored.reason).toBe('undercut');
    expect(scored.points).toBe(11 - 10 + 25);
  });

  it('pays the undercut bonus when the defender lands equal or lower', () => {
    const scored = scoreHand(
      freshState({
        knocker: 0,
        hands: [
          ['S5', 'S6', 'S7', 'H8', 'H9', 'H10', 'D2', 'D9'], // deadwood 11
          ['S4', 'D11'], // S4 lays off; the jack leaves 10 ≤ 11 → undercut
        ],
      }),
    );
    expect(scored.reason).toBe('undercut');
    expect(scored.scorer).toBe(1);
    expect(scored.points).toBe(11 - 10 + 25);
  });

  it('awards gin with the full defender deadwood plus bonus, no layoffs', () => {
    const scored = scoreHand(
      freshState({
        knocker: 0,
        hands: [
          ['S3', 'S4', 'S5', 'H7', 'H8', 'H9', 'D2', 'D3', 'D4', 'D5'],
          ['C12', 'C13', 'D6'],
        ],
      }),
    );
    expect(scored.reason).toBe('gin');
    expect(scored.layoffs).toEqual([]);
    expect(scored.deadwood).toEqual([0, 26]);
    expect(scored.points).toBe(26 + DEFAULTS.ginBonus);
  });

  it('big gin needs eleven melded cards and pays its own bonus', () => {
    const eleven = ['S2', 'S3', 'S4', 'S5', 'S6', 'H7', 'H8', 'H9', 'D3', 'D4', 'D5'];
    const scored = scoreHand(
      freshState({
        knocker: 1,
        hands: [['C10', 'C12', 'C13'], eleven],
      }),
    );
    expect(scored.reason).toBe('big-gin');
    expect(scored.points).toBe(30 + DEFAULTS.bigGinBonus);
  });

  it('downgrades big gin to plain gin when the toggle is off', () => {
    const rules = { ...DEFAULTS, bigGin: false };
    const scored = scoreHand(
      freshState({
        rules,
        knocker: 1,
        hands: [
          ['C10', 'C12', 'C13'],
          ['S2', 'S3', 'S4', 'S5', 'S6', 'H7', 'H8', 'H9', 'D3', 'D4', 'D5'],
        ],
      }),
    );
    expect(scored.reason).toBe('gin');
    expect(scored.points).toBe(30 + rules.ginBonus);
  });
});

describe('dead hand', () => {
  it('fires once the stock starves after a completed turn', () => {
    let session = createSession(def, { seed: 11, config: DEFAULTS, seats: 2 });
    // drive turns until the stock nearly empties, always drawing stock and
    // discarding the first legal non-drawn card
    let guard = 0;
    while (session.status === 'playing' && guard++ < 400) {
      const phase = session.phase;
      if (phase.phase === 'over') break;
      if (phase.actor === null) break;
      const legal = def.flow.legalMovesFor!(session.state, phase, phase.actor!);
      if (legal.length === 0) break;
      if (phase.phase === 'option') {
        session = play(session, phase.actor!, 'option.pass').session;
        continue;
      }
      if (phase.phase === 'turn') {
        session = play(session, phase.actor!, 'draw.stock').session;
        continue;
      }
      if (phase.phase === 'act') {
        const throws = legal.filter((m) => m.id === 'discard');
        if (throws.length > 0) {
          session = play(session, phase.actor!, 'discard', throws[0]!.payload).session;
          continue;
        }
      }
      break;
    }
    expect(session.state.outcome?.reason ?? null).toBe('dead-hand');
    expect(session.status).toBe('ended');
    expect(session.result?.winner).toBeNull();
  });

  it('gives the drawing seat one final act before the hand dies', () => {
    // stock of exactly two after the draw: the act phase is still offered
    const state = freshState({ stock: ['C5', 'D5'] });
    const next = applyMove(state, 0, 'draw.stock').state;
    expect(next.stock).toHaveLength(1);
    expect(next.outcome).toBeNull();
  });
});

describe('fx emission', () => {
  it('emits fx hints on every applied move', () => {
    let session = createSession(def, { seed: 3, config: DEFAULTS, seats: 2 });
    session = play(session, 1, 'option.pass').session;
    session = play(session, 0, 'option.pass').session;
    // both passes auto-applied the forced stock draw for seat 1
    const forced = session.log.find((event) => event.automatic && event.move === 'draw.stock');
    expect(forced).toBeDefined();
    // the act phase now offers discards whose application carries flight fx
    const legal = def.flow.legalMovesFor!(session.state, session.phase, 1);
    const throwMove = legal.find((move) => move.id === 'discard');
    expect(throwMove).toBeDefined();
    const outcome = play(session, 1, 'discard', throwMove!.payload);
    expect(outcome.fx.some((event) => event.kind === Fx.DiscardCard)).toBe(true);
  });

  it('stamps knock, reveals and round end on showdown', () => {
    const state = freshState({
      knocker: 0,
      hands: [
        ['S3', 'S4', 'S5', 'H7', 'H8', 'H9', 'D2', 'D3', 'D4', 'D5'],
        ['C10', 'C12', 'C13'],
      ],
    });
    const { fx } = applyMove(state, 0, 'showdown');
    expect(fx.some((event) => event.kind === 'gin.gin')).toBe(true);
    expect(fx.filter((event) => event.kind === Fx.ShowdownReveal)).toHaveLength(2);
    expect(fx.some((event) => event.kind === Fx.RoundEnd)).toBe(true);
  });
});

describe('redaction', () => {
  it('hides opponent hand faces and the stock order', () => {
    const session = createSession(def, { seed: 5, config: DEFAULTS, seats: 2 });
    const view = def.playerView(session.state, 0);
    expect(view.hands[0]).toEqual(session.state.hands[0]);
    expect(view.hands[1]).toHaveLength(10);
    expect(view.hands[1]!.every((card) => card === '?')).toBe(true);
    expect(view.stock.every((card) => card === '?')).toBe(true);
    expect(view.discard).toEqual(session.state.discard);
    expect(view.pickups).toEqual(session.state.pickups);
  });
});
