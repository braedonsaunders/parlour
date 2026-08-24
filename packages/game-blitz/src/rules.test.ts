import {
  createFx,
  createSession,
  Fx,
  makeRng,
  replaySession,
  sessionApply,
  stateHash,
  type GameSession,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { blitzConfigSchema, type BlitzConfig } from './config';
import { bestSuit, handValue, hasThreeOfAKind, isBlitz, pipValue } from './hand';
import { blitzSeat, createBlitzDef, HAND_SIZE } from './rules';
import { scoreRound } from './score';
import type { BlitzState } from './state';

const def = createBlitzDef();
const DEFAULTS = blitzConfigSchema.defaults();

function freshState(partial: Partial<BlitzState> = {}): BlitzState {
  return {
    rules: DEFAULTS,
    seats: 2,
    hands: [
      ['S1', 'H5', 'D9'],
      ['C3', 'C4', 'C5'],
    ],
    stock: [],
    discard: ['S2'],
    turn: 0,
    knocker: null,
    postKnockTurns: 0,
    drawnFromDiscard: null,
    pickups: [],
    outcome: null,
    out: [],
    veiled: false,
    ...partial,
  };
}

function play(
  session: GameSession<BlitzState, BlitzConfig>,
  seat: number,
  move: string,
  payload?: unknown,
) {
  const outcome = sessionApply(def, session, seat, move, payload);
  if (outcome.rejected) throw new Error(`${move} rejected: ${outcome.rejected.code}`);
  return outcome;
}

/** deterministic driver: rotates through the legal list every turn */
function drive(session: GameSession<BlitzState, BlitzConfig>, maxEvents = 300) {
  let cursor = session;
  let guard = 0;
  while (cursor.status === 'playing' && guard++ < maxEvents) {
    const actor = cursor.phase.actor;
    if (actor === null) break;
    const legal = def.flow.legalMoves(cursor.state, cursor.phase);
    if (legal.length === 0) break;
    const choice = legal[guard % legal.length]!;
    const outcome = sessionApply(def, cursor, actor, choice.id, choice.payload);
    if (outcome.rejected || outcome.session === cursor) break;
    cursor = outcome.session;
  }
  return cursor;
}

// ---------------------------------------------------------------------------
// hand evaluation
// ---------------------------------------------------------------------------

describe('pipValue', () => {
  it('scores aces 11, courts 10 and pips at face', () => {
    expect(pipValue('S1')).toBe(11);
    expect(pipValue('H12')).toBe(10);
    expect(pipValue('D13')).toBe(10);
    expect(pipValue('S10')).toBe(10);
    expect(pipValue('C7')).toBe(7);
  });

  it('throws on unknown card ids', () => {
    expect(() => pipValue('X1')).toThrow(/unknown card id/);
  });
});

describe('handValue', () => {
  const BASE = DEFAULTS;

  it('takes the best suited sum (spec §5.1)', () => {
    expect(handValue(['S1', 'H4', 'D3'], BASE)).toBe(11);
    expect(handValue(['S1', 'S13', 'H4'], BASE)).toBe(21);
    expect(bestSuit(['S2', 'S3', 'H10'])).toEqual({ suit: 'hearts', value: 10 });
    expect(bestSuit([])).toBeNull();
  });

  it('recognises a natural suited 31 as a blitz', () => {
    expect(handValue(['S1', 'S12', 'S13'], BASE)).toBe(31);
    expect(isBlitz(['S1', 'S12', 'S13'])).toBe(true);
    expect(isBlitz(['S1', 'S12', 'H13'])).toBe(false);
    // a four-card pile can total 31 (or more) mid-turn — that is not a blitz
    expect(isBlitz(['S1', 'S10', 'S11', 'S12'])).toBe(false);
    expect(isBlitz(['S1', 'S10', 'H5', 'S13'])).toBe(false);
  });

  it('counts three of a kind per house rule', () => {
    const tok = ['S9', 'H9', 'D9'];
    expect(hasThreeOfAKind(tok)).toBe(true);
    expect(hasThreeOfAKind(['S9', 'H9', 'D8'])).toBe(false);
    expect(handValue(tok, BASE)).toBe(30.5);
    expect(handValue(tok, { ...BASE, threeOfAKind: '30' })).toBe(30);
    expect(handValue(tok, { ...BASE, threeOfAKind: 'off' })).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// showdown scoring
// ---------------------------------------------------------------------------

describe('scoreRound', () => {
  it('ranks by hand value; the sole lowest loses', () => {
    const state = freshState({
      seats: 3,
      hands: [
        ['S7', 'S8', 'S9'], // 24
        ['H2', 'H3', 'H4'], // 9 — lowest
        ['C5', 'C6', 'C10'], // 21
      ],
    });
    const outcome = scoreRound(state);
    expect(outcome.reason).toBe('showdown');
    expect(outcome.winners).toEqual([0]);
    expect(outcome.rankings.at(-1)?.seat).toBe(1);
    expect(outcome.rankings[0]?.detail?.handValue).toBe(24);
  });

  it('a knocker tied for lowest takes the penalty instead (spec §5.1)', () => {
    const state = freshState({
      knocker: 0,
      hands: [
        ['S2', 'S3', 'S4'], // 9
        ['H2', 'H3', 'H4'], // 9 — tied with the knocker
      ],
    });
    const outcome = scoreRound(state);
    expect(outcome.winners).toEqual([1]);
    expect(outcome.rankings.at(-1)?.seat).toBe(0);
  });

  it('tieLowest=both drops every tied low hand together', () => {
    const state = freshState({
      seats: 3,
      hands: [
        ['S2', 'S3', 'S4'],
        ['H2', 'H3', 'H4'],
        ['C7', 'C8', 'C9'],
      ],
    });
    const outcome = scoreRound(state);
    expect(outcome.winners).toEqual([2]);
    expect(outcome.rankings.filter((r) => r.rank === 1)).toHaveLength(1);
    expect(
      outcome.rankings
        .slice(-2)
        .map((r) => r.seat)
        .sort(),
    ).toEqual([0, 1]);
  });

  it('tieLowest=nobody spares the tied lows but still crowns the top', () => {
    const state = freshState({
      rules: { ...DEFAULTS, tieLowest: 'nobody' },
      seats: 3,
      hands: [
        ['S2', 'S3', 'S4'],
        ['H2', 'H3', 'H4'],
        ['C7', 'C8', 'C9'],
      ],
    });
    const outcome = scoreRound(state);
    expect(outcome.winners).toEqual([2]);
    expect(outcome.rankings).toHaveLength(3);
  });

  it('tieLowest=redeal returns an empty redeal outcome', () => {
    const state = freshState({
      rules: { ...DEFAULTS, tieLowest: 'redeal' },
      hands: [
        ['S2', 'S3', 'S4'],
        ['H2', 'H3', 'H4'],
      ],
    });
    const outcome = scoreRound(state);
    expect(outcome.reason).toBe('redeal');
    expect(outcome.winners).toEqual([]);
    expect(outcome.rankings).toEqual([]);
  });

  it('three-of-a-kind counts at showdown per house rule', () => {
    const tokHand = ['S9', 'H9', 'D9']; // 30.5
    const plain = ['C7', 'C8', 'C9']; // 24
    expect(scoreRound(freshState({ hands: [tokHand, plain] })).winners).toEqual([0]);
    expect(
      scoreRound(
        freshState({ rules: { ...DEFAULTS, threeOfAKind: 'off' }, hands: [tokHand, plain] }),
      ).winners,
    ).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// live rounds over the session runtime
// ---------------------------------------------------------------------------

describe('blitz round flow', () => {
  it('deals 3 cards each, flips one, opens on seat 0 with deal fx', () => {
    const session = createSession(def, { seed: 42, config: DEFAULTS, seats: 4 });
    expect(session.state.hands.map((h) => h.length)).toEqual([3, 3, 3, 3]);
    expect(session.state.discard).toHaveLength(1);
    expect(session.state.stock).toHaveLength(52 - 12 - 1);
    expect(session.phase).toMatchObject({ phase: 'turn', actor: 0 });
    const dealFx = session.setupFx?.filter((event) => event.kind === Fx.DealCard) ?? [];
    expect(dealFx).toHaveLength(12);
    expect(dealFx.map(({ at }) => at)).toEqual([
      0, 70, 140, 210, 280, 350, 420, 490, 560, 630, 700, 770,
    ]);
    expect(dealFx.map(({ payload }) => (payload as { to: string }).to)).toEqual([
      'hand:0',
      'hand:1',
      'hand:2',
      'hand:3',
      'hand:0',
      'hand:1',
      'hand:2',
      'hand:3',
      'hand:0',
      'hand:1',
      'hand:2',
      'hand:3',
    ]);
    expect(session.setupFx?.find((event) => event.kind === Fx.FlipCard)?.at).toBe(840);
  });

  it('draw then discard cycles to the next seat with ordered fx', () => {
    let session = createSession(def, { seed: 7, config: DEFAULTS, seats: 2 });

    let out = play(session, 0, 'draw.stock');
    session = out.session;
    expect(out.fx.map((e) => e.kind)).toEqual([Fx.DrawCard]);
    expect(session.phase).toMatchObject({ phase: 'discard', actor: 0 });

    // addTo puts the freshly drawn card on top (index 0)
    const held = session.state.hands[0]![0];
    out = play(session, 0, 'discard', { card: held });
    session = out.session;
    expect(out.fx.map((e) => e.kind)).toEqual([Fx.DiscardCard]);
    expect(session.phase).toMatchObject({ phase: 'turn', actor: 1 });
    expect(session.state.discard[0]).toBe(held);
  });

  it('locks re-discarding the card just drawn from the pile, per house rule', () => {
    let session = createSession(def, { seed: 7, config: DEFAULTS, seats: 2 });
    const top = session.state.discard[0]!;

    session = play(session, 0, 'draw.discard').session;
    expect(session.state.drawnFromDiscard).toBe(top);

    const rejected = sessionApply(def, session, 0, 'discard', { card: top });
    expect(rejected.rejected?.code).toBe('discard-locked');

    const openSession = createSession(def, {
      seed: 7,
      config: blitzConfigSchema.resolve({ discardLock: false }),
      seats: 2,
    });
    const opened = play(openSession, 0, 'draw.discard').session;
    expect(sessionApply(def, opened, 0, 'discard', { card: top }).rejected).toBeUndefined();
  });

  it('allows knocking with any hand value instead of drawing', () => {
    const created = createSession(def, { seed: 11, config: DEFAULTS, seats: 2 });
    const session: GameSession<BlitzState, BlitzConfig> = {
      ...created,
      state: freshState({
        hands: [
          ['S2', 'S3', 'S4'], // 9
          ['H5', 'H6', 'H7'],
        ],
      }),
    };

    expect(def.flow.legalMoves(session.state, session.phase)).toContainEqual({ id: 'knock' });

    const outcome = play(session, 0, 'knock');
    expect(outcome.fx.map((event) => event.kind)).toEqual([Fx.Knock]);
    expect(outcome.session.state.knocker).toBe(0);
    expect(outcome.session.phase).toMatchObject({ phase: 'turn', actor: 1 });
  });

  it('rejects a second knock and runs exactly one extra turn each before showdown', () => {
    let session = createSession(def, { seed: 11, config: DEFAULTS, seats: 3 });

    session = play(session, 0, 'knock').session;
    expect(session.state.knocker).toBe(0);
    expect(session.state.postKnockTurns).toBe(2);

    // once someone has knocked, knocking is no longer a legal move at all
    expect(sessionApply(def, session, 1, 'knock').rejected?.code).toBe('illegal-move');

    for (const seat of [1, 2]) {
      session = play(session, seat, 'draw.stock').session;
      const held = session.state.hands[seat]![0];
      session = play(session, seat, 'discard', { card: held }).session;
    }

    expect(session.status).toBe('ended');
    expect(session.result?.reason).toBe('showdown');
    expect(session.phase.actor).toBeNull();
  });

  it('reshuffles the discard minus its top when the stock runs dry', () => {
    const state = freshState({ stock: [], discard: ['S2', 'H6', 'D11'] });
    const ctx = { rng: makeRng(99), fx: createFx(), event: { seq: 0 } };

    const verdict = def.moves['draw.stock']!.validate(state, 0, undefined);
    expect(verdict).toBe(true);

    const applied = def.moves['draw.stock']!.apply(state, 0, undefined, ctx);
    // discard minus its flipped top is reshuffled into the stock, then one card is drawn
    expect(applied.discard).toEqual(['S2']);
    expect(applied.stock).toHaveLength(1);
    for (const card of applied.stock) expect(['H6', 'D11']).toContain(card);
    expect(ctx.fx.events.some((e) => e.kind === Fx.ShuffleStock)).toBe(true);
    // the drawn card joins the acting seat's hand on top
    expect(applied.hands[0]).toHaveLength(HAND_SIZE + 1);
    expect(applied.hands[0]![0]).not.toBe('S2');
  });

  it('refuses to draw when stock and discard are both spent', () => {
    const state = freshState({ stock: [], discard: ['S2'] });
    const verdict = def.moves['draw.stock']!.validate(state, 0, undefined);
    expect(verdict).not.toBe(true);
  });

  it('does not treat a four-card 31 as a blitz — the extra card still has to go', () => {
    const state = freshState({
      hands: [
        ['S1', 'S10', 'H5'], // 21 in spades across a live three-card hand
        ['C2', 'C3', 'C4'],
      ],
      stock: ['S13'],
      discard: ['D2'],
    });
    const ctx = { rng: makeRng(1), fx: createFx(), event: { seq: 0 } };
    const drawn = def.moves['draw.stock']!.apply(state, 0, undefined, ctx);
    expect(drawn.hands[0]).toEqual(['S13', 'S1', 'S10', 'H5']);
    expect(handValue(drawn.hands[0]!, DEFAULTS)).toBe(31);
    expect(isBlitz(drawn.hands[0]!)).toBe(false);
    expect(blitzSeat(drawn)).toBeNull();
    expect(
      def.flow.advance(drawn, { seq: 0, seat: 0, move: 'draw.stock' }, 2).autoMoves ?? [],
    ).toEqual([]);

    const kept = def.moves['discard']!.apply(
      drawn,
      0,
      { card: 'H5' },
      {
        rng: makeRng(1),
        fx: createFx(),
        event: { seq: 1 },
      },
    );
    expect(kept.hands[0]).toEqual(['S13', 'S1', 'S10']);
    expect(isBlitz(kept.hands[0]!)).toBe(true);
    expect(blitzSeat(kept)).toBe(0);
  });

  it('does not deal to or pass the turn to a seat that is already out', () => {
    const session = createSession(def, {
      seed: 4,
      config: { ...DEFAULTS, outMask: 1 << 2 },
      seats: 4,
    });
    expect(session.state.out).toEqual([2]);
    expect(session.state.hands[2]).toEqual([]);
    expect(session.state.hands[0]).toHaveLength(HAND_SIZE);
    expect(session.state.hands[1]).toHaveLength(HAND_SIZE);
    expect(session.state.hands[3]).toHaveLength(HAND_SIZE);
    expect(session.phase.actor).not.toBe(2);

    const actors: number[] = [];
    const finished = drive(session, 400);
    for (const event of finished.log) {
      if (event.seat !== null && event.move !== 'blitz' && event.move !== 'showdown') {
        actors.push(event.seat);
      }
    }
    expect(actors).not.toContain(2);
    expect(finished.state.hands[2]).toEqual([]);
  });

  it('ends instantly on a dealt blitz before any turn', () => {
    const state = freshState({
      hands: [
        ['S1', 'S12', 'S13'],
        ['C2', 'C3', 'C4'],
      ],
    });
    expect(blitzSeat(state)).toBe(0);
    expect(def.end(state)).toMatchObject({ winner: 0, reason: 'blitz' });
  });

  it('ends instantly when a draw makes 31 mid-round, and replays hash-stable', () => {
    // dealt-blitz seeds end with an empty log; we want a blitz reached in play
    let found: GameSession<BlitzState, BlitzConfig> | null = null;
    for (let seed = 1; seed < 5000 && !found; seed++) {
      const session = drive(createSession(def, { seed, config: DEFAULTS, seats: 2 }), 200);
      if (
        session.status === 'ended' &&
        session.result?.reason === 'blitz' &&
        session.log.length > 4
      ) {
        found = session;
      }
    }

    expect(found).not.toBeNull();
    expect(found!.log.length).toBeGreaterThan(4);
    const blitting = found!.log.find((e) => e.move === 'blitz');
    expect(blitting).toBeDefined();

    const replayed = replaySession(def, found!.seed, found!.log, {
      config: DEFAULTS,
      seats: 2,
    });
    expect(replayed.result?.reason).toBe('blitz');
    expect(replayed.lastAppliedHash).toBe(found!.lastAppliedHash);
    expect(stateHash(replayed.state)).toBe(stateHash(found!.state));
    expect(replaySession(def, found!.seed, found!.log, { config: DEFAULTS, seats: 2 }).log).toEqual(
      found!.log,
    );
  });

  it('redacts opponent hands and stock ids but keeps public information open', () => {
    const session = createSession(def, { seed: 3, config: DEFAULTS, seats: 3 });
    const view = def.playerView(session.state, 0);
    expect(view.hands[0]).toEqual(session.state.hands[0]);
    expect(view.hands[1]!.every((c) => c === '?')).toBe(true);
    expect(view.stock.every((c) => c === '?')).toBe(true);
    expect(view.discard).toEqual(session.state.discard);
  });

  it('stays replay hash-stable across full scripted rounds', () => {
    const live = drive(createSession(def, { seed: 2026, config: DEFAULTS, seats: 4 }));
    const replayed = replaySession(def, 2026, live.log, { config: DEFAULTS, seats: 4 });

    expect(stateHash(replayed.state)).toBe(stateHash(live.state));
    expect(replayed.log.map((e) => e.hash)).toEqual(live.log.map((e) => e.hash));
    expect(replayed.result).toEqual(live.result);
  });
});
