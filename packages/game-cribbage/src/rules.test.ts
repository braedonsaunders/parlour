import { describe, expect, it } from 'vitest';
import {
  createFx,
  createSession,
  makeRng,
  replayMatchesLog,
  replaySession,
  sessionApply,
  stateHash,
  stdDeck,
  type AppliedEvent,
  type CardId,
  type FxEvent,
  type GameSession,
  type MoveCtx,
} from '@parlour/engine';
import { cribbageConfigSchema, type CribbageConfig } from './config';
import { createCribbageDef } from './rules';
import { SKUNK_LINE, TARGET_SCORE, type CribbageState } from './state';
import { tierBot } from './bots';

const S = (rank: number) => `S${rank}` as CardId;
const H = (rank: number) => `H${rank}` as CardId;
const D = (rank: number) => `D${rank}` as CardId;
const C = (rank: number) => `C${rank}` as CardId;

const DEFAULTS = cribbageConfigSchema.defaults();
const def = createCribbageDef();

/** Builds a 52-card deck order matching the engine's round-robin deal. */
function riggedDeck(
  hands: readonly [readonly CardId[], readonly CardId[]],
  stockTop: readonly CardId[],
): CardId[] {
  const order: CardId[] = [];
  for (let round = 0; round < 6; round++) {
    order.push(hands[0][round] as CardId, hands[1][round] as CardId);
  }
  const used = new Set<CardId>([...order, ...stockTop]);
  const rest = stdDeck().cardIds.filter((card) => !used.has(card));
  return [...order, ...stockTop, ...rest];
}

type Session = GameSession<CribbageState, CribbageConfig>;

function riggedSession(hands: Parameters<typeof riggedDeck>[0], stockTop: CardId[]): Session {
  return createSession(def, {
    seed: 7,
    config: DEFAULTS,
    seats: 2,
    deckOrder: riggedDeck(hands, stockTop),
  });
}

function discardCribs(session: Session): Session {
  let current = session;
  for (const seat of [0, 1]) {
    const hand = current.state.hands[seat] as CardId[];
    const outcome = sessionApply(def, current, seat, 'crib.discard', {
      cards: [hand[0], hand[1]],
    });
    expect(outcome.rejected).toBeUndefined();
    current = outcome.session;
  }
  return current;
}

function cutStarter(session: Session): { session: Session; fx: readonly FxEvent[] } {
  const outcome = sessionApply(def, session, session.state.dealer, 'cut');
  expect(outcome.rejected).toBeUndefined();
  return { session: outcome.session, fx: outcome.fx };
}

describe('setup', () => {
  it('deals six cards each with the remainder in the stock', () => {
    const session = createSession(def, { seed: 11, config: DEFAULTS, seats: 2 });
    expect(session.state.hands.map((hand) => hand.length)).toEqual([6, 6]);
    expect(session.state.stock.length).toBe(40);
    expect(session.state.starter).toBeNull();
    expect(session.state.dealer).toBe(0);
    expect(session.state.totals).toEqual([0, 0]);
    expect(session.status).toBe('playing');
    expect((session.setupFx ?? []).filter((event) => event.kind === 'card.fly').length).toBe(12);
  });

  it('opens in a simultaneous crib-discard phase for every seat', () => {
    const session = createSession(def, { seed: 11, config: DEFAULTS, seats: 2 });
    expect(session.phase.phase).toBe('discard');
    expect(session.phase.actors).toEqual([0, 1]);
    for (const seat of [0, 1]) {
      const legal = def.flow.legalMovesFor!(session.state, session.phase, seat);
      expect(legal.length).toBe(15); // C(6,2)
      expect(new Set(legal.map((move) => move.id))).toEqual(new Set(['crib.discard']));
    }
  });

  it('rejects malformed and out-of-phase moves', () => {
    const session = createSession(def, { seed: 11, config: DEFAULTS, seats: 2 });
    const hand = session.state.hands[0] as CardId[];
    expect(sessionApply(def, session, 0, 'crib.discard', { cards: [hand[0]] }).rejected?.code).toBe(
      'bad-payload',
    );
    expect(
      sessionApply(def, session, 0, 'crib.discard', { cards: [hand[0], hand[0]] }).rejected?.code,
    ).toBe('duplicate-cards');
    expect(
      sessionApply(def, session, 0, 'crib.discard', { cards: [hand[0], 'X9' as CardId] }).rejected
        ?.code,
    ).toBe('not-in-hand');
    // the runtime gate rejects out-of-phase moves before move validation
    expect(sessionApply(def, session, 0, 'playCard', { card: hand[0] }).rejected?.code).toBe(
      'illegal-move',
    );
  });
});

describe('the cut', () => {
  it('is reserved for the dealer and produces a public starter', () => {
    const session = discardCribs(createSession(def, { seed: 11, config: DEFAULTS, seats: 2 }));
    expect(sessionApply(def, session, 1, 'cut').rejected?.code).toBe('not-your-turn');
    const cut = cutStarter(session);
    expect(cut.session.state.starter).toBeTruthy();
    expect(cut.session.state.stock.length).toBe(39);
    expect(cut.fx.some((event) => event.kind === 'card.flip')).toBe(true);
  });

  it('pays his heels to the dealer on a jack cut', () => {
    const session = discardCribs(
      riggedSession(
        [
          [C(12), D(12), D(6), C(4), D(1), H(7)],
          [C(10), S(3), S(9), C(8), H(2), H(11)],
        ],
        [S(11)],
      ),
    );
    const cut = cutStarter(session);
    expect(cut.session.state.starter).toBe(S(11));
    expect(cut.session.state.totals[0]).toBe(2); // dealer is seat 0
    expect(cut.fx.some((event) => event.kind === 'cribbage.heels')).toBe(true);
    expect(cut.fx.some((event) => event.kind === 'cribbage.peg')).toBe(true);
  });

  it('hands the first lead to the pone', () => {
    const cut = cutStarter(
      discardCribs(createSession(def, { seed: 11, config: DEFAULTS, seats: 2 })),
    );
    expect(cut.session.state.pegging.turn).toBe(1);
    expect(cut.session.phase.phase).toBe('peg');
  });
});

describe('the canonical pegging script', () => {
  // Dealer (seat 0) keeps {6♦ 4♣ A♦ 7♥}; pone (seat 1) keeps {9♠ 8♣ 2♥ J♥}.
  function scripted(): Session {
    return cutStarter(
      discardCribs(
        riggedSession(
          [
            [C(12), D(11), D(6), C(4), D(1), H(7)],
            [C(10), S(3), S(9), C(8), H(2), H(11)],
          ],
          [S(5)],
        ),
      ),
    ).session;
  }

  it('walks fifteen, run, go, thirty-one, reset and last card', () => {
    let session = scripted();
    const fx: FxEvent[] = [];
    const play = (seat: number, card: CardId) => {
      const outcome = sessionApply(def, session, seat, 'playCard', { card });
      expect(
        outcome.rejected,
        `${seat} playing ${card}: ${outcome.rejected?.message}`,
      ).toBeUndefined();
      fx.push(...outcome.fx);
      session = outcome.session;
      return session;
    };

    // sequence one
    play(1, S(9)); // pone leads → count 9
    expect(session.state.totals).toEqual([0, 0]);
    play(0, D(6)); // count 15 — fifteen, two to the dealer
    expect(session.state.totals).toEqual([2, 0]);
    play(1, C(8)); // count 23
    play(0, H(7)); // count 30 — 6-8-7-9 is a four-run in any order (+4)
    expect(session.state.totals).toEqual([6, 0]);

    // pone cannot play under 31 — the flow announces go automatically
    expect(session.state.pegging.passed).toEqual([1]);
    expect(fx.some((event) => event.kind === 'cribbage.go')).toBe(true);

    play(0, D(1)); // ace lands the count on exactly 31 — two more
    expect(session.state.totals).toEqual([8, 0]);
    expect(fx.some((event) => event.kind === 'cribbage.thirtyone')).toBe(true);
    // the row resets with no go point paid and the pone leads anew
    expect(session.state.pegging.count).toBe(0);
    expect(session.state.pegging.pile.length).toBe(0);
    expect(session.state.pegging.turn).toBe(1);

    // sequence two: the dealer's last card, then pone's jack closes the deal
    play(1, H(2)); // count 2 —pone keeps going
    expect(session.state.pegging.turn).toBe(0);
    play(0, C(4)); // count 6
    play(1, H(11)); // count 16 — pone's last card takes the point (+1)
    expect(session.state.totals[0]).toBeGreaterThanOrEqual(8);
    expect(session.state.totals[1]).toBeGreaterThanOrEqual(1);
    // the show fired inside settle (reveals in the fx stream) and rolled
    // straight into the next deal
    expect(fx.some((event) => event.kind === 'showdown.reveal')).toBe(true);
    expect(session.state.dealNo).toBe(1);
    expect(session.state.dealer).toBe(1);
    expect(session.state.starter).toBeNull();
    expect(session.state.hands.every((hand) => hand.length === 6)).toBe(true);
    // a fresh deal opens with fresh crib discards; the primary actor points
    // at whoever still owes two to the crib
    expect(session.phase.phase).toBe('discard');
    expect(session.state.dealer).toBe(1);
  });

  it('never lets the count pass 31', () => {
    let session = scripted();
    const play = (seat: number, card: CardId) => {
      const outcome = sessionApply(def, session, seat, 'playCard', { card });
      expect(outcome.rejected).toBeUndefined();
      session = outcome.session;
    };
    play(1, S(9));
    play(0, D(6));
    play(1, C(8));
    play(0, H(7)); // count 30
    // pone passed automatically; the ace is the only legal reply
    expect(session.state.pegging.turn).toBe(0);
    expect(session.state.pegging.count).toBe(30);
    const illegal = sessionApply(def, session, 0, 'playCard', { card: H(5) as CardId }); // not held
    expect(illegal.rejected?.code).toBe('not-in-hand');
  });
});

describe('the show', () => {
  it('reveals in order and never counts past the win', () => {
    const { ctx, fx } = syntheticCtx();
    const move = def.moves['show.score']!;
    const state = baseState({
      totals: [119, 119],
      pegged: [
        [C(1), C(2), C(3), C(4)], // dealer shows after pone — may never be counted
        [H(5), D(5), C(5), S(11)], // pone holds the 29-hand
      ],
      starter: S(5),
      pegging: { pile: [], owners: [], count: 0, turn: null, passed: [] },
    });
    const next = move.apply(state, null as unknown as number, undefined, ctx);
    expect(next.outcome?.winner).toBe(1); // pone counts first and hits 121
    const reveals = fx.filter((event) => event.kind === 'showdown.reveal');
    expect(reveals.length).toBe(1); // dealer's hand and the crib stay uncounted
    expect(reveals[0]?.payload).toMatchObject({ seat: 1, label: 'hand' });
    expect(next.showDone).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// synthetic states — surgical move tests without session plumbing
// ---------------------------------------------------------------------------

function syntheticCtx(): { ctx: MoveCtx; fx: FxEvent[] } {
  const emitter = createFx();
  return { ctx: { rng: makeRng(5), fx: emitter, event: { seq: 0 } }, fx: emitter.events };
}

function baseState(patch: Partial<CribbageState> = {}): CribbageState {
  return {
    rules: DEFAULTS,
    seats: 2,
    veiled: false,
    dealer: 0,
    dealNo: 0,
    hands: [
      [H(13), D(13), C(13), S(13), H(6), D(7)],
      [S(1), H(1), D(1), C(1), S(6), S(7)],
    ],
    crib: [],
    stock: [],
    played: [],
    pegged: [[], []],
    starter: C(8),
    showDone: false,
    pegging: { pile: [], owners: [], count: 0, turn: null, passed: [] },
    totals: [0, 0],
    unclaimed: null,
    outcome: null,
    ...patch,
  };
}

describe('synthetic move surgery', () => {
  it('ends the game the instant a peg crosses 121', () => {
    const { ctx, fx } = syntheticCtx();
    const state = baseState({
      totals: [118, 40],
      hands: [[C(5)], [S(6)]],
      pegging: { pile: [H(5), D(5)], owners: [0, 1], count: 10, turn: 0, passed: [] },
    });
    const next = def.moves['playCard']!.apply(state, 0, { card: C(5) }, ctx); // fifteen + trip royal = 8
    expect(next.outcome?.winner).toBe(0);
    expect(next.outcome?.finalTotals[0]).toBeGreaterThanOrEqual(TARGET_SCORE);
    expect(fx.some((event) => event.kind === 'round.end')).toBe(true);
  });

  it('calls the skunk when the loser finishes below the line', () => {
    const { ctx, fx } = syntheticCtx();
    const state = baseState({
      totals: [121, 74],
      hands: [[C(5)], [S(6)]],
      pegging: { pile: [], owners: [], count: 0, turn: null, passed: [] },
      showDone: true,
    });
    const next = def.moves['show.score']!.apply(state, null as unknown as number, undefined, ctx);
    expect(next.outcome?.winner).toBe(0);
    expect(next.outcome?.skunked).toBe(true);
    expect(next.outcome?.reason).toBe('skunk');
    expect(fx.some((event) => event.kind === 'cribbage.skunk')).toBe(true);
  });

  it('never calls a skunk when the house rule is off', () => {
    const { ctx } = syntheticCtx();
    const state = baseState({
      rules: { skunks: false, muggins: false, gamesToWin: 1 },
      totals: [121, 20],
      showDone: true,
    });
    const next = def.moves['show.score']!.apply(state, null as unknown as number, undefined, ctx);
    expect(next.outcome?.skunked).toBe(false);
    expect(next.outcome?.reason).toBe('121');
  });
});

describe('muggins', () => {
  const MUGGINS = cribbageConfigSchema.resolve({ muggins: true });

  it('holds table points unclaimed until claimed or stolen', () => {
    const { ctx } = syntheticCtx();
    const state = baseState({
      rules: MUGGINS,
      totals: [10, 10],
      hands: [[D(10)], [C(3)]],
      pegging: { pile: [H(5)], owners: [1], count: 5, turn: 0, passed: [] },
    });
    const played = def.moves['playCard']!.apply(state, 0, { card: D(10) }, ctx);
    expect(played.unclaimed).toMatchObject({ seat: 0, points: 2 });
    expect(played.totals).toEqual([10, 10]); // not banked yet

    const claimed = def.moves['claim']!.apply(played, 0, undefined, ctx);
    expect(claimed.unclaimed).toBeNull();
    expect(claimed.totals).toEqual([12, 10]);
  });

  it('lets the opponent steal the pot', () => {
    const { ctx } = syntheticCtx();
    const state = baseState({
      rules: MUGGINS,
      totals: [10, 10],
      unclaimed: { seat: 0, points: 3 },
    });
    const stolen = def.moves['steal']!.apply(state, 1, undefined, ctx);
    expect(stolen.unclaimed).toBeNull();
    expect(stolen.totals).toEqual([10, 13]);
  });

  it('banks a stale pot before holding fresh points', () => {
    const { ctx } = syntheticCtx();
    const state = baseState({
      rules: MUGGINS,
      totals: [10, 10],
      unclaimed: { seat: 0, points: 2 },
      hands: [[S(6)], [D(10)]],
      pegging: { pile: [H(5)], owners: [0], count: 5, turn: 1, passed: [] },
    });
    const played = def.moves['playCard']!.apply(state, 1, { card: D(10) }, ctx);
    expect(played.totals).toEqual([12, 10]); // seat 0's old pot banked automatically
    expect(played.unclaimed).toMatchObject({ seat: 1, points: 2 }); // the new fifteen waits
  });

  it('is inert when the rule is off', () => {
    const { ctx } = syntheticCtx();
    const state = baseState({
      totals: [10, 10],
      hands: [[D(10)], [C(3)]],
      pegging: { pile: [H(5)], owners: [1], count: 5, turn: 0, passed: [] },
    });
    const played = def.moves['playCard']!.apply(state, 0, { card: D(10) }, ctx);
    expect(played.unclaimed).toBeNull();
    expect(played.totals).toEqual([12, 10]); // banked immediately
    const verdict = def.moves['steal']!.validate(played, 1, undefined);
    expect(typeof verdict === 'object' && verdict.code).toBe('muggins-off');
  });

  it('voids an outstanding pot at the show', () => {
    const { ctx } = syntheticCtx();
    const state = baseState({
      rules: MUGGINS,
      totals: [30, 30],
      unclaimed: { seat: 0, points: 2 },
      showDone: true,
    });
    const next = def.moves['show.score']!.apply(state, null as unknown as number, undefined, ctx);
    expect(next.unclaimed).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// full bot games
// ---------------------------------------------------------------------------

function playBotGame(seed: number, config: CribbageConfig = DEFAULTS): Session {
  let session = createSession(def, { seed, config, seats: 2 });
  const rng = makeRng(seed).fork('test-bots');
  let guard = 0;
  while (session.status === 'playing' && guard++ < 6000) {
    // multi-actor phases (simultaneous discards, muggins calls): first seated
    // actor with a legal move acts, exactly like the engine's runBotGame
    let actor: number | null = null;
    let legal: readonly import('@parlour/engine').LegalMove[] = [];
    for (const seat of session.phase.actors ?? [session.phase.actor]) {
      if (seat === null || seat === undefined) continue;
      const moves = def.flow.legalMovesFor!(session.state, session.phase, seat);
      if (moves.length > 0) {
        actor = seat;
        legal = moves;
        break;
      }
    }
    if (actor === null) throw new Error(`no actor in phase ${session.phase.phase}`);
    if (legal.length === 0) throw new Error(`unreachable`);
    const policy = tierBot(actor === 0 ? 3 : 1);
    const choice =
      policy.chooseMove(def.playerView(session.state, actor), actor, legal, rng, {
        thinkMs: () => 0,
      }) ?? legal[0]!;
    const outcome = sessionApply(def, session, actor, choice.id, choice.payload);
    if (outcome.rejected) throw new Error(`bot move rejected: ${outcome.rejected.message}`);
    session = outcome.session;
  }
  expect(session.status).toBe('ended');
  return session;
}

describe('full bot games', () => {
  it('races to 121 across rotating deals', () => {
    const session = playBotGame(101);
    const result = session.result!;
    expect(result.winner).not.toBeNull();
    const totals = session.state.outcome!.finalTotals;
    expect(totals[result.winner as number]).toBeGreaterThanOrEqual(TARGET_SCORE);
    expect(session.state.dealNo).toBeGreaterThan(0);
  });

  it('replays bit-for-bit from the log', () => {
    const session = playBotGame(202);
    const log = session.log as AppliedEvent[];
    const replayed = replaySession(def, session.seed, log, { config: DEFAULTS, seats: 2 });
    expect(replayed.status).toBe('ended');
    expect(stateHash(replayed.state)).toBe(stateHash(session.state));
    expect(replayed.result?.winner).toBe(session.result?.winner);
    expect(replayMatchesLog(replayed.lastAppliedHash, log)).toBe(true);
  });

  it('completes with muggins on', () => {
    const config = cribbageConfigSchema.resolve({ muggins: true });
    const session = playBotGame(303, config);
    expect(session.status).toBe('ended');
    expect(session.config.muggins).toBe(true);
  });

  it('calls the skunk when the loser finishes under the line', { timeout: 60_000 }, () => {
    let found = false;
    for (let seed = 900; seed < 935 && !found; seed++) {
      const session = playBotGame(seed);
      const outcome = session.state.outcome!;
      if (outcome.skunked) {
        found = true;
        expect(session.result?.reason).toBe('skunk');
        const winner = session.result!.winner as number;
        const loserTotals = outcome.finalTotals.filter((_, seat) => seat !== winner);
        expect(Math.min(...loserTotals)).toBeLessThan(SKUNK_LINE);
      }
    }
    expect(found).toBe(true);
  });
});

describe('redaction', () => {
  it('hides opponents, the crib and the stock but keeps counts', () => {
    const cut = cutStarter(
      discardCribs(createSession(def, { seed: 31, config: DEFAULTS, seats: 2 })),
    );
    const session = cut.session;
    const view = def.playerView(session.state, 0);
    expect(view.hands[0]).toEqual(session.state.hands[0]);
    expect(view.hands[1]?.every((card) => card === '?')).toBe(true);
    expect(view.crib.every((card) => card === '?')).toBe(true);
    expect(view.stock.every((card) => card === '?')).toBe(true);
    expect(view.stock.length).toBe(session.state.stock.length);
    expect(view.crib.length).toBe(session.state.crib.length);
    expect(view.totals).toEqual(session.state.totals);
    expect(view.pegging).toEqual(session.state.pegging);
  });

  it('opens the crib to the viewer once the show has been counted', () => {
    const shown = baseState({ showDone: true, crib: [H(2), D(3), S(4), C(6)] });
    const view = def.playerView(shown, 0);
    expect(view.crib).toEqual(shown.crib);
  });
});

describe('discard/cut phase gating', () => {
  it('never offers the cut until every seat has thrown to the crib', () => {
    const session = createSession(def, { seed: 11, config: DEFAULTS, seats: 2 });
    // seat 0 (dealer) throws first
    const hand0 = session.state.hands[0] as CardId[];
    const after0 = sessionApply(def, session, 0, 'crib.discard', {
      cards: [hand0[0], hand0[1]],
    }).session;
    expect(after0.state.hands.map((hand) => hand.length)).toEqual([4, 6]);
    // the dealer still cannot cut — the opponent owes two
    expect(def.flow.legalMovesFor!(after0.state, after0.phase, 0)).toEqual([]);
    expect(
      def.flow.legalMovesFor!(after0.state, after0.phase, 1).every(
        (move) => move.id === 'crib.discard',
      ),
    ).toBe(true);
    // and the runtime enforces it too
    expect(sessionApply(def, after0, 0, 'cut').rejected).toBeDefined();
  });
});

describe('Veil show openings', () => {
  it('requires the dealer to open every crib handle before scoring', () => {
    const veiled = baseState({ crib: ['v#1', 'v#2', 'v#3', 'v#4'] as CardId[] });
    expect(def.moves['crib.open']!.validate(veiled, 0, undefined)).toMatchObject({
      code: 'crib-not-opened',
    });
    expect(
      def.moves['crib.open']!.validate({ ...veiled, crib: [S(1), H(2), D(3), C(4)] }, 0, undefined),
    ).toBe(true);
    expect(def.moves['crib.open']!.validate(veiled, 1, undefined)).toMatchObject({
      code: 'not-dealer',
    });
  });
});
