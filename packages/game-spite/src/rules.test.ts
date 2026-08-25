import { describe, expect, it } from 'vitest';
import { createFx, Fx, makeRng, sessionApply } from '@parlour/engine';
import { LAST_RANK } from './cards';
import { spiteGame } from './game';
import { defaults, card, fixture, wild } from './test-util';

describe('centre pile completion', () => {
  const buried = [card(10), card(11)];
  const stockBefore = [card(2, 1), card(3, 2)];

  function ready() {
    return fixture({
      hands: [[card(12), card(5)], []],
      centre: [
        { cards: [...buried], nextRank: LAST_RANK },
        { cards: [], nextRank: 1 },
        { cards: [], nextRank: 1 },
        { cards: [], nextRank: 1 },
      ],
      payoffs: [[], []],
      stock: stockBefore,
      started: true,
    });
  }

  it('retires a completed pile to the stock and leaves it empty', () => {
    const played = sessionApply(spiteGame, ready(), 0, 'build', {
      card: card(12),
      pile: 0,
      rank: LAST_RANK,
    });
    expect(played.rejected).toBeUndefined();
    const state = played.session.state;

    expect(state.centre[0]).toEqual({ cards: [], nextRank: 1 });
    expect(state.stock).toHaveLength(buried.length + 1 + stockBefore.length);
    for (const swept of [...buried, card(12)]) expect(state.stock).toContain(swept);
    expect(played.fx.map((event) => event.kind)).toContain('spite.complete');
    expect(played.fx.map((event) => event.kind)).toContain(Fx.ShuffleStock);
  });

  it('emits one flight per swept card inside the cascade budget', () => {
    const played = sessionApply(spiteGame, ready(), 0, 'build', {
      card: card(12),
      pile: 0,
      rank: LAST_RANK,
    });
    const flights = played.fx.filter(
      (event) =>
        event.kind === Fx.DealCard && (event.payload as { from?: string }).from === 'centre:0',
    );
    // The Queen plus the two buried ranks all fly home.
    expect(flights).toHaveLength(3);
    const lastAt = flights[flights.length - 1]?.at ?? 0;
    expect(lastAt).toBeLessThanOrEqual(700);
  });

  it('accepts an Ace or a wild again once emptied', () => {
    const played = sessionApply(spiteGame, ready(), 0, 'build', {
      card: card(12),
      pile: 0,
      rank: LAST_RANK,
    });
    const state = played.session.state;

    const withAce = sessionApply(
      spiteGame,
      { ...played.session, state: { ...state, hands: [[card(1), wild()], []] } },
      0,
      'build',
      { card: card(1), pile: 0, rank: 1 },
    );
    expect(withAce.rejected).toBeUndefined();
    expect(withAce.session.state.centre[0]).toMatchObject({ nextRank: 2 });

    const withWild = sessionApply(
      spiteGame,
      { ...played.session, state: { ...state, hands: [[wild(), card(9)], []] } },
      0,
      'build',
      { card: wild(), pile: 0, rank: 1 },
    );
    expect(withWild.rejected).toBeUndefined();
    expect(withWild.session.state.wildRanks[wild()]).toBe(1);
  });

  it('clears the retired pile’s wild claims along with its cards', () => {
    // A wild standing as Jack completes nothing here but must lose its claim
    // when the pile eventually retires under a Queen.
    const opened = sessionApply(spiteGame, ready(), 0, 'build', {
      card: card(12),
      pile: 0,
      rank: LAST_RANK,
    });
    const state = opened.session.state;
    const wildPiled = sessionApply(
      spiteGame,
      { ...opened.session, state: { ...state, hands: [[wild(), card(9)], []] } },
      0,
      'build',
      { card: wild(), pile: 0, rank: 1 },
    );
    expect(wildPiled.session.state.wildRanks[wild()]).toBe(1);

    const completed = sessionApply(
      spiteGame,
      {
        ...wildPiled.session,
        state: {
          ...wildPiled.session.state,
          hands: [[card(LAST_RANK)], []],
          centre: wildPiled.session.state.centre.map((pile, index) =>
            index === 0 ? { cards: [wild()], nextRank: LAST_RANK } : pile,
          ),
        },
      },
      0,
      'build',
      { card: card(LAST_RANK), pile: 0, rank: LAST_RANK },
    );
    expect(completed.rejected).toBeUndefined();
    expect(completed.session.state.centre[0]).toEqual({ cards: [], nextRank: 1 });
    expect(completed.session.state.wildRanks[wild()]).toBeUndefined();
  });
});

describe('wild ranks are recorded, not inferred', () => {
  it('records what a wild stands for and demands exactly N+1 next', () => {
    const session = fixture({
      hands: [[wild(), card(3), card(2)], []],
      centre: [
        { cards: [], nextRank: 1 },
        { cards: [], nextRank: 1 },
        { cards: [], nextRank: 1 },
        { cards: [], nextRank: 1 },
      ],
      payoffs: [[], []],
      stock: [],
      started: true,
    });

    const played = sessionApply(spiteGame, session, 0, 'build', {
      card: wild(),
      pile: 0,
      rank: 1,
    });
    expect(played.rejected).toBeUndefined();
    expect(played.session.state.wildRanks[wild()]).toBe(1);
    expect(played.session.state.centre[0]).toMatchObject({ nextRank: 2 });
    expect(played.fx).toContainEqual({
      kind: 'spite.wild',
      payload: { seat: 0, pile: 0, card: wild(), rank: 1 },
    });

    // The two fits the fresh demand; the three does not.
    const follow = played.session;
    const options = spiteGame.flow.legalMoves(follow.state, follow.phase);
    expect(options).toContainEqual({ id: 'build', payload: { card: card(2), pile: 0, rank: 2 } });
    expect(
      options.find(
        (move) => move.id === 'build' && (move.payload as { card?: string }).card === card(3),
      ),
    ).toBeUndefined();

    const stacked = sessionApply(spiteGame, follow, 0, 'build', {
      card: card(2),
      pile: 0,
      rank: 2,
    });
    expect(stacked.rejected).toBeUndefined();
    expect(stacked.session.state.centre[0]).toMatchObject({ nextRank: 3 });
  });

  it('lets a joker stand in identically when the table deals them', () => {
    const rules = { ...defaults, jokersWild: true, kingsWild: false };
    const session = fixture(
      {
        hands: [[wild(3), card(7)], []],
        payoffs: [[], []],
        stock: [],
        started: true,
      },
      rules,
    );
    const played = sessionApply(spiteGame, session, 0, 'build', {
      card: wild(3),
      pile: 1,
      rank: 1,
    });
    expect(played.rejected).toBeUndefined();
    expect(played.session.state.wildRanks[wild(3)]).toBe(1);
  });

  it('refuses a wild claiming a rank outside the build range', () => {
    const session = fixture({ hands: [[wild()], []], payoffs: [[], []], stock: [] });
    const rejected = sessionApply(spiteGame, session, 0, 'build', {
      card: wild(),
      pile: 0,
      rank: OFF_LADDER_RANK,
    });
    expect(rejected.rejected?.code).toBe('bad-rank');
  });
});

/** One past the top of the ladder: no wild may ever stand for it. */
const OFF_LADDER_RANK = 13;

describe('mid-turn refill', () => {
  const deepStock = Array.from({ length: 12 }, (_, i) => card(i + 1, 1));

  it('refills to five and keeps the turn when the hand empties', () => {
    const rules = { ...defaults, refillMidTurn: true };
    const session = fixture(
      { hands: [[card(1)], []], payoffs: [[], []], stock: deepStock, started: true },
      rules,
    );
    const played = sessionApply(spiteGame, session, 0, 'build', {
      card: card(1),
      pile: 0,
      rank: 1,
    });
    expect(played.rejected).toBeUndefined();
    expect(played.session.state.hands[0]).toHaveLength(rules.handSize);
    expect(played.session.state.stock).toHaveLength(deepStock.length - rules.handSize);
    expect(played.session.phase).toMatchObject({ phase: 'turn', actor: 0 });
  });

  it('plays on short-handed when refilling is off', () => {
    const rules = { ...defaults, refillMidTurn: false };
    const session = fixture(
      {
        hands: [[card(1)], []],
        payoffs: [[card(2)], []],
        stock: deepStock,
        started: true,
      },
      rules,
    );
    const played = sessionApply(spiteGame, session, 0, 'build', {
      card: card(1),
      pile: 0,
      rank: 1,
    });
    expect(played.rejected).toBeUndefined();
    expect(played.session.state.hands[0]).toHaveLength(0);
    expect(played.session.phase).toMatchObject({ phase: 'turn', actor: 0 });

    // Short-handed does not mean stuck: the exposed payoff top is still theirs
    // to play, and taking it wins outright.
    const finished = sessionApply(spiteGame, played.session, 0, 'build', {
      card: card(2),
      pile: 0,
      rank: 2,
    });
    expect(finished.session.status).toBe('ended');
    expect(finished.session.result?.winner).toBe(0);
  });

  it('sits a truly stranded seat down instead of stalling', () => {
    const rules = { ...defaults, refillMidTurn: false };
    const stranded = fixture(
      {
        hands: [[], []],
        payoffs: [[], [card(9)]],
        discards: [
          [[card(8)], []],
          [[], []],
        ],
        stock: [],
        started: true,
        turn: 0,
      },
      rules,
    );
    expect(spiteGame.flow.legalMoves(stranded.state, stranded.phase)).toEqual([]);
    const advanced = spiteGame.flow.advance(
      stranded.state,
      { move: 'probe', seq: 0, seat: null },
      2,
    );
    expect(advanced.autoMoves).toEqual([
      { seat: null, move: 'sit', reason: 'nothing left to play' },
    ]);
  });
});

describe('winning', () => {
  it('wins the instant the last payoff card lands, mid-turn, without a discard', () => {
    const lastPayoff = card(1, 1);
    const session = fixture({
      hands: [[card(2, 2), card(8)], []],
      payoffs: [[lastPayoff], [card(6), card(7)]],
      stock: [],
      started: true,
    });
    const played = sessionApply(spiteGame, session, 0, 'build', {
      card: lastPayoff,
      pile: 0,
      rank: 1,
    });
    expect(played.rejected).toBeUndefined();
    expect(played.session.status).toBe('ended');
    expect(played.session.result).toMatchObject({ winner: 0, reason: 'payoff-cleared' });
    expect(played.events.map((event) => event.move)).not.toContain('discard');
    expect(played.fx.map((event) => event.kind)).toContain('spite.win');
    expect(played.session.phase).toMatchObject({ phase: 'ended', actor: null });
  });

  it('does not win while payoff cards remain', () => {
    const session = fixture({
      hands: [[card(1), card(2)], []],
      payoffs: [[card(6), card(7)], [card(3)]],
      stock: [],
      started: true,
    });
    const played = sessionApply(spiteGame, session, 0, 'build', {
      card: card(1),
      pile: 0,
      rank: 1,
    });
    expect(played.session.status).toBe('playing');
    expect(played.session.state.winner).toBeNull();
  });
});

describe('payoff flips', () => {
  it('flips exactly one new card face up and emits fx for it', () => {
    const top = card(1);
    const buried = card(5);
    const session = fixture({
      hands: [[card(2)], []],
      payoffs: [[top, buried], []],
      stock: [],
      started: true,
    });
    const played = sessionApply(spiteGame, session, 0, 'build', { card: top, pile: 0, rank: 1 });
    expect(played.session.state.payoffs[0]).toEqual([buried]);

    const flips = played.fx.filter((event) => event.kind === Fx.FlipCard);
    expect(flips).toHaveLength(1);
    expect(flips[0]).toMatchObject({ payload: { card: buried, seat: 0 } });
  });
});

describe('table lock termination', () => {
  it('settles a deadlocked table by closest-to-victory instead of stalling', () => {
    const rules = { ...defaults, refillMidTurn: false };
    const session = fixture(
      {
        hands: [[card(5)], []],
        payoffs: [[], [card(9)]],
        discards: [
          [[], []],
          [[], []],
        ],
        stock: [],
        started: true,
      },
      rules,
    );
    const discarded = sessionApply(spiteGame, session, 0, 'discard', { card: card(5), pile: 0 });
    expect(discarded.rejected).toBeUndefined();
    // Seat 1 is stuck, then seat 0 too: every consecutive sit ends the match.
    expect(discarded.session.status).toBe('ended');
    expect(discarded.session.result?.reason).toBe('table-locked');
    // Fewest payoff cards left wins the settlement — seat 0 has none.
    expect(discarded.session.result?.winner).toBe(0);
  });
});

describe('dry-stock gather', () => {
  function applyDrawUp(state: ReturnType<typeof fixture>['state'], seat: number, phase: string) {
    const fx = createFx();
    const move = spiteGame.moves.drawUp!;
    const next = move.apply(state, seat, { phase }, {
      rng: makeRng(3),
      fx,
      event: { seq: 0 },
    } as never);
    return { state: next, fx: fx.events };
  }

  it('sweeps centre remnants home at the start of a turn and resets demands', () => {
    const state = fixture({
      hands: [[], []],
      payoffs: [[], []],
      discards: [
        [[card(9), card(8)], []],
        [[], []],
      ],
      centre: [
        { cards: [card(3, 1), card(2, 1), card(1, 1)], nextRank: 4 },
        { cards: [], nextRank: 1 },
        { cards: [], nextRank: 1 },
        { cards: [], nextRank: 1 },
      ],
      stock: [],
      turn: 1,
      started: false,
    }).state;

    const { state: refilled, fx } = applyDrawUp(state, 1, 'start');
    expect(refilled.centre).toEqual(Array.from({ length: 4 }, () => ({ cards: [], nextRank: 1 })));
    for (const swept of [card(3, 1), card(2, 1), card(1, 1)]) {
      expect(refilled.stock.concat(refilled.hands[1] ?? [])).toContain(swept);
    }
    expect(refilled.hands[1]?.length).toBeGreaterThan(0);
    expect(fx.map((event) => event.kind)).toContain('spite.gather');
    expect(fx.map((event) => event.kind)).toContain(Fx.ShuffleStock);

    // A mid-turn refill with a dry stock gathers nothing and draws nothing —
    // that honour belongs to the start of the turn, or one seat could feed
    // itself forever off the centre.
    const midState = fixture({
      hands: [[], []],
      centre: [
        { cards: [card(5)], nextRank: 6 },
        { cards: [], nextRank: 1 },
      ],
      stock: [],
      turn: 1,
      started: true,
    }).state;
    const untouched = applyDrawUp(midState, 1, 'mid');
    expect(untouched.state.centre[0]).toMatchObject({ nextRank: 6 });
    expect(untouched.fx.some((event) => event.kind === 'spite.gather')).toBe(false);
  });
});
