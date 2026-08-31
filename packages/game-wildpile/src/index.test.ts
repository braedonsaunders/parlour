import {
  Fx,
  applyPreset,
  createFx,
  createSession,
  makeRng,
  runBotGame,
  replaySession,
  sessionApply,
  sessionInject,
  stateHash,
  type GameSession,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import {
  GAME_ID,
  WILDPILE_BASE_CARD_IDS,
  WILDPILE_COLORS,
  WILDPILE_SWAP_CARD_IDS,
  wildpileConfig,
  wildpileDeck,
  wildpileGame,
  wildpileTierBot,
  WILDPILE_BOTS,
  type WildpileState,
} from './index';

const defaults = wildpileConfig.defaults();

function card(kind: string, color = 'red', copy = 0): string {
  return kind === 'wild' || kind === 'wild-draw-four'
    ? `${kind}-${copy}`
    : `${color}-${kind}-${copy}`;
}

function fixture(overrides: Partial<WildpileState> = {}): GameSession<WildpileState> {
  const session = createSession(wildpileGame, { seed: 91, config: defaults, seats: 3 });
  const state: WildpileState = {
    seats: 3,
    hands: [
      [card('5'), card('skip')],
      [card('5', 'red', 1), card('2', 'blue')],
      [card('9', 'green')],
    ],
    stock: [card('1', 'yellow'), card('3', 'green'), card('4', 'blue')],
    discard: [card('3')],
    turn: 0,
    direction: 1,
    activeColor: 'red',
    pendingDraw: 0,
    pendingKind: null,
    awaitingColor: null,
    awaitingSwap: null,
    interrupt: null,
    drawnCard: null,
    challenge: null,
    calledLastCard: [false, false, false],
    winner: null,
    timeoutRankings: null,
    rules: defaults,
    veiled: false,
    ...overrides,
  };
  return {
    ...session,
    config: state.rules,
    state,
    phase: wildpileGame.flow.start(state, state.seats),
  };
}

describe('wildpile deck and setup', () => {
  it('keeps the default decision window brisk', () => {
    expect(defaults.turnTimeSeconds).toBe(15);
  });

  it('ships one policy per shared difficulty tier', () => {
    expect(WILDPILE_BOTS.map((bot) => bot.tier)).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((tier) => wildpileTierBot(tier as 1 | 2 | 3).tier)).toEqual([1, 2, 3]);
  });

  it('defines the complete 112-card Wild deck plus the optional swap wilds', () => {
    expect(GAME_ID).toBe('wildpile');
    expect(WILDPILE_BASE_CARD_IDS).toHaveLength(112);
    expect(WILDPILE_SWAP_CARD_IDS).toHaveLength(4);
    expect(wildpileDeck.cardIds).toHaveLength(116);
    expect(new Set(wildpileDeck.cardIds)).toHaveLength(116);
    expect(
      Object.values(wildpileDeck.faces).filter((face) => face.meta?.kind === 'wild'),
    ).toHaveLength(4);
    expect(
      Object.values(wildpileDeck.faces).filter((face) => face.meta?.kind === 'wild-draw-four'),
    ).toHaveLength(4);
    expect(
      Object.values(wildpileDeck.faces).filter((face) => face.meta?.kind === 'wild-swap'),
    ).toHaveLength(2);
    expect(
      Object.values(wildpileDeck.faces).filter((face) => face.meta?.kind === 'wild-shuffle'),
    ).toHaveLength(2);
    expect(
      Object.values(wildpileDeck.faces).filter((face) => face.meta?.kind === 'discard-all'),
    ).toHaveLength(4);
  });

  it('deals seven each, starts on a number, emits deal fx, and is seed-stable', () => {
    const a = createSession(wildpileGame, { seed: 2026, config: defaults, seats: 4 });
    const b = createSession(wildpileGame, { seed: 2026, config: defaults, seats: 4 });
    expect(a.state.hands.map((hand) => hand.length)).toEqual([7, 7, 7, 7]);
    expect(a.state.stock).toHaveLength(83);
    expect(wildpileDeck.faces[a.state.discard[0] as string]?.meta?.kind).toBe('number');
    expect(a.setupFx).toHaveLength(29);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  });

  it('fails closed outside the supported two-to-four-seat range', () => {
    expect(() => createSession(wildpileGame, { seed: 1, config: defaults, seats: 1 })).toThrow(
      'wildpile requires 2–4 seats',
    );
    expect(() => createSession(wildpileGame, { seed: 1, config: defaults, seats: 5 })).toThrow(
      'wildpile requires 2–4 seats',
    );
  });
});

describe('wildpile moves and flow', () => {
  it('plays matching cards with fx and opens a jump-in window for an exact duplicate', () => {
    const played = sessionApply(wildpileGame, fixture(), 0, 'playCard', { card: card('5') });
    expect(played.rejected).toBeUndefined();
    expect(played.fx.map((event) => event.kind)).toContain('card.discard');
    expect(played.session.phase).toMatchObject({ phase: 'interrupt', actor: 1 });
    expect(played.session.state.interrupt?.resumeTurn).toBe(1);

    // Protection is offered inside the jump-in window too — the jumper is about
    // to drop to one card just as surely as if it were their own turn.
    const armed = sessionApply(wildpileGame, played.session, 1, 'callLastCard');
    expect(armed.rejected).toBeUndefined();
    expect(armed.session.phase).toMatchObject({ phase: 'interrupt', actor: 1 });

    const jumped = sessionApply(wildpileGame, armed.session, 1, 'playCard', {
      card: card('5', 'red', 1),
    });
    expect(jumped.rejected).toBeUndefined();
    expect(jumped.session.state.hands[1]).toEqual([card('2', 'blue')]);
    expect(jumped.session.state.turn).toBe(2);
  });

  it('keeps a skipped seat out of the jump-in queue so the skip actually skips', () => {
    // Seat 1 holds the twin skip: without the guard it would jump straight back
    // in and undo the card that was played to pass over it.
    const skipped = sessionApply(
      wildpileGame,
      fixture({
        hands: [
          [card('skip'), card('6', 'green')],
          [card('skip', 'red', 1), card('2', 'blue')],
          [card('9', 'green')],
        ],
      }),
      0,
      'playCard',
      { card: card('skip') },
    );

    expect(skipped.rejected).toBeUndefined();
    expect(skipped.session.state.interrupt).toBeNull();
    expect(skipped.session.phase).toMatchObject({ phase: 'play', actor: 2 });
    expect(skipped.fx).toContainEqual({ kind: 'wildpile.skip', payload: { seat: 1 } });
  });

  it('lets a head-to-head reverse take the extra turn it earned', () => {
    // With two seats a reverse is a skip, so the twin in the other hand must not
    // buy a jump-in back into the turn it was just denied.
    const heads = createSession(wildpileGame, { seed: 5, config: defaults, seats: 2 });
    const state: WildpileState = {
      ...heads.state,
      seats: 2,
      hands: [
        [card('reverse'), card('6', 'green')],
        [card('reverse', 'red', 1), card('2', 'blue')],
      ],
      turn: 0,
      direction: 1,
      activeColor: 'red',
      discard: [card('3')],
      calledLastCard: [true, false],
    };
    const reversed = sessionApply(
      wildpileGame,
      { ...heads, state, phase: wildpileGame.flow.start(state, 2) },
      0,
      'playCard',
      { card: card('reverse') },
    );

    expect(reversed.session.state.direction).toBe(-1);
    expect(reversed.session.state.interrupt).toBeNull();
    expect(reversed.session.phase).toMatchObject({ phase: 'play', actor: 0 });
  });

  it('arms last-card protection without spending the turn and announces the call', () => {
    const armed = sessionApply(
      wildpileGame,
      fixture({ hands: [[card('5'), card('6')], [card('1')], [card('2')]] }),
      0,
      'callLastCard',
    );

    expect(armed.rejected).toBeUndefined();
    expect(armed.session.state.calledLastCard).toEqual([true, false, false]);
    expect(armed.session.state.hands[0]).toHaveLength(2);
    expect(armed.session.phase).toMatchObject({ phase: 'play', actor: 0 });
    expect(armed.fx).toContainEqual({ kind: 'wildpile.last-card-armed', payload: { seat: 0 } });

    const played = sessionApply(wildpileGame, armed.session, 0, 'playCard', { card: card('5') });
    expect(played.session.state.hands[0]).toHaveLength(1);
    expect(played.fx).toContainEqual({ kind: 'wildpile.last-card', payload: { seat: 0 } });
    expect(played.fx.some((event) => event.kind === 'wildpile.caught')).toBe(false);
  });

  it('catches a seat that reaches one card without arming protection', () => {
    const played = sessionApply(
      wildpileGame,
      fixture({ hands: [[card('5'), card('6')], [card('1')], [card('2')]] }),
      0,
      'playCard',
      { card: card('5') },
    );

    expect(played.fx).toContainEqual(
      expect.objectContaining({ kind: 'wildpile.caught', payload: { seat: 0, amount: 2 } }),
    );
    expect(played.session.state.hands[0]).toHaveLength(3);
  });

  it('only offers protection on the second-to-last card, and re-arms after a draw', () => {
    const three = fixture({ hands: [[card('5'), card('6'), card('7')], [card('1')], [card('2')]] });
    expect(wildpileGame.flow.legalMoves(three.state, three.phase).map((m) => m.id)).not.toContain(
      'callLastCard',
    );

    const two = fixture({ hands: [[card('5'), card('6')], [card('1')], [card('2')]] });
    const armed = sessionApply(wildpileGame, two, 0, 'callLastCard').session;
    expect(wildpileGame.flow.legalMoves(armed.state, armed.phase).map((m) => m.id)).not.toContain(
      'callLastCard',
    );

    // Drawing lifts the hand off the cliff, so the call has to be made again.
    const drawn = sessionApply(wildpileGame, armed, 0, 'draw').session;
    expect(drawn.state.calledLastCard[0]).toBe(false);
  });

  it('supports skip, reverse, draw-two, and deterministic stock recycling', () => {
    const play = wildpileGame.moves.playCard;
    const fx = createFx();
    const skipped = play?.apply(
      fixture({ hands: [[card('skip')], [card('1')], [card('2')]] }).state,
      0,
      { card: card('skip') },
      { rng: makeRng(1), fx, event: { seq: 0 } },
    );
    expect(skipped?.turn).toBe(2);
    expect(fx.events.map((event) => event.kind)).toContain('wildpile.skip');

    const reversed = play?.apply(
      fixture({ hands: [[card('reverse')], [card('1')], [card('2')]] }).state,
      0,
      { card: card('reverse') },
      { rng: makeRng(1), fx: createFx(), event: { seq: 0 } },
    );
    expect(reversed).toMatchObject({ direction: -1, turn: 2 });

    const drawState = fixture({
      hands: [[card('draw-two'), card('6', 'green')], [card('1')], [card('2')]],
      stock: [],
      discard: [card('3'), card('7', 'blue'), card('8', 'yellow')],
      calledLastCard: [true, false, false],
    });
    const stacked = sessionApply(wildpileGame, drawState, 0, 'playCard', {
      card: card('draw-two'),
    });
    // Seat 1 holds nothing to stack, so the flow takes the pickup for them.
    expect(stacked.fx).toContainEqual({
      kind: 'wildpile.draw-stack',
      payload: { seat: 0, amount: 2 },
    });
    expect(stacked.session.state.pendingDraw).toBe(0);
    expect(stacked.session.state.hands[1]).toHaveLength(3);
    expect(stacked.session.state.turn).toBe(2);
    expect(stacked.session.state.discard).toHaveLength(1);
    expect(stacked.fx.map((event) => event.kind)).toContain('stock.shuffle');
    expect(stacked.session.log.at(-1)).toMatchObject({ move: 'draw', seat: 1, automatic: true });
  });

  it('drops every card of its color under Drop All without firing swept actions', () => {
    const dropped = sessionApply(
      wildpileGame,
      fixture({
        rules: { ...defaults, jumpIn: false },
        hands: [
          [card('discard-all'), card('2'), card('skip'), card('4', 'blue'), card('6', 'green')],
          [card('1')],
          [card('2')],
        ],
      }),
      0,
      'playCard',
      { card: card('discard-all') },
    );

    expect(dropped.rejected).toBeUndefined();
    expect(dropped.session.state.hands[0]).toEqual([card('4', 'blue'), card('6', 'green')]);
    expect(dropped.session.state.discard.slice(0, 4)).toEqual([
      card('discard-all'),
      card('2'),
      card('skip'),
      card('3'),
    ]);
    expect(dropped.session.state.activeColor).toBe('red');
    expect(dropped.session.state.turn).toBe(1);
    expect(dropped.fx).toContainEqual({
      kind: 'wildpile.discard-all',
      payload: { seat: 0, color: 'red', amount: 3 },
      at: 130,
    });
    expect(dropped.fx.filter((event) => event.kind === Fx.DiscardCard)).toHaveLength(3);
    expect(dropped.fx.some((event) => event.kind === 'wildpile.skip')).toBe(false);
  });

  it('can go out on Drop All and offers last-card protection for a partial dump', () => {
    const winner = sessionApply(
      wildpileGame,
      fixture({
        rules: { ...defaults, jumpIn: false },
        hands: [[card('discard-all'), card('8')], [card('1')], [card('2')]],
      }),
      0,
      'playCard',
      { card: card('discard-all') },
    );
    expect(winner.session.state.hands[0]).toEqual([]);
    expect(winner.session.result?.winner).toBe(0);

    const needsCall = fixture({
      rules: { ...defaults, jumpIn: false },
      hands: [[card('discard-all'), card('8'), card('4', 'blue')], [card('1')], [card('2')]],
    });
    expect(
      wildpileGame.flow.legalMoves(needsCall.state, needsCall.phase).map((move) => move.id),
    ).toContain('callLastCard');
    const armed = sessionApply(wildpileGame, needsCall, 0, 'callLastCard').session;
    const dropped = sessionApply(wildpileGame, armed, 0, 'playCard', {
      card: card('discard-all'),
    });
    expect(dropped.session.state.hands[0]).toEqual([card('4', 'blue')]);
    expect(dropped.fx).toContainEqual({ kind: 'wildpile.last-card', payload: { seat: 0 } });
    expect(dropped.fx.some((event) => event.kind === 'wildpile.caught')).toBe(false);
  });

  it('requires a color sub-decision after a wild and applies draw-four stacking rules', () => {
    const wildSession = fixture({
      hands: [[card('wild'), card('6', 'green')], [card('1')], [card('2')]],
    });
    const wild = sessionApply(wildpileGame, wildSession, 0, 'playCard', { card: card('wild') });
    expect(wild.session.phase).toMatchObject({ phase: 'choose-color', actor: 0 });
    expect(wild.session.state.activeColor).toBeNull();
    const colored = sessionApply(wildpileGame, wild.session, 0, 'chooseColor', { color: 'blue' });
    expect(colored.session.state).toMatchObject({ activeColor: 'blue', turn: 1 });

    const pending = fixture({
      // Stacking mechanics only — the challenge window is its own suite below.
      rules: { ...defaults, challengeDrawFour: false },
      turn: 1,
      activeColor: 'blue',
      pendingDraw: 4,
      pendingKind: 'wild-draw-four',
      hands: [[card('1')], [card('wild-draw-four', 'red', 1), card('3', 'green')], [card('2')]],
      stock: Array.from({ length: 12 }, (_, index) =>
        card(String(Math.floor(index / 2) + 1), 'yellow', index % 2),
      ),
      calledLastCard: [false, true, false],
    });
    const stack = sessionApply(wildpileGame, pending, 1, 'playCard', {
      card: card('wild-draw-four', 'red', 1),
    });
    expect(stack.rejected).toBeUndefined();
    expect(stack.session.state.pendingDraw).toBe(8);
    expect(stack.session.phase).toMatchObject({ phase: 'choose-color', actor: 1 });

    // The eight only lands once the color is called, and seat 2 cannot stack.
    const resolved = sessionApply(wildpileGame, stack.session, 1, 'chooseColor', {
      color: 'green',
    });
    expect(resolved.session.state.pendingDraw).toBe(0);
    expect(resolved.session.state.hands[2]).toHaveLength(9);
    expect(resolved.session.state.turn).toBe(0);

    const noStackState = fixture({
      ...pending.state,
      rules: { ...defaults, stackDrawFour: false },
    });
    const noStack = sessionApply(wildpileGame, noStackState, 1, 'playCard', {
      card: card('wild-draw-four', 'red', 1),
    });
    expect(noStack.rejected?.code).toBe('illegal-move');
  });

  it('redacts hidden zones and replays an action log exactly', () => {
    const hidden = fixture({ rules: { ...defaults, jumpIn: false } });
    const view = wildpileGame.playerView(hidden.state, 1);
    expect(view.hands[0]).toEqual(hidden.state.hands[0]?.map(() => '??'));
    expect(view.hands[1]).toEqual(hidden.state.hands[1]);
    expect(view.stock.every((id) => id === '??')).toBe(true);

    let session = createSession(wildpileGame, { seed: 91, config: defaults, seats: 3 });
    const move = wildpileGame.flow.legalMoves(session.state, session.phase)[0];
    expect(move).toBeDefined();
    if (!move) return;
    session = sessionApply(wildpileGame, session, 0, move.id, move.payload).session;
    const replayed = replaySession(wildpileGame, session.seed, session.log, {
      config: session.config,
      seats: session.seats,
    });
    expect(replayed.state).toEqual(session.state);
    expect(replayed.log.map((event) => event.hash)).toEqual(session.log.map((event) => event.hash));
  });

  it.each([
    [404, 2],
    [17, 3],
    [2026, 4],
    [8080, 2],
  ])('has a bot-completable %i-seed game with %i seats', (seed, seats) => {
    let session = createSession(wildpileGame, { seed, config: defaults, seats });
    const bot = wildpileGame.bots[0];
    for (let step = 0; step < 5000 && session.status === 'playing'; step++) {
      const actor = session.phase.actor;
      expect(actor).not.toBeNull();
      if (actor === null || !bot) break;
      const legal = wildpileGame.flow.legalMoves(session.state, session.phase);
      const chosen = bot.chooseMove(session.state, actor, legal, makeRng(step), {
        thinkMs: () => 0,
      });
      expect(chosen).not.toBeNull();
      if (!chosen) break;
      const outcome = sessionApply(wildpileGame, session, actor, chosen.id, chosen.payload);
      expect(outcome.rejected).toBeUndefined();
      session = outcome.session;
    }
    expect(session.status).toBe('ended');
    expect(session.result?.winner).not.toBeNull();
  });

  it.each(['classic', 'party', 'houseRules'])(
    'finishes every %s deal at 2, 3 and 4 seats',
    (preset) => {
      for (const seats of [2, 3, 4]) {
        for (let seed = 0; seed < 25; seed++) {
          const record = runBotGame(wildpileGame, {
            seed,
            policies: Array.from({ length: seats }, () => wildpileGame.bots[0]),
            config: applyPreset(wildpileConfig, preset),
            maxEvents: 6_000,
          });
          expect(record.result?.winner, `${preset} ${seats}p seed ${seed}`).not.toBeNull();
        }
      }
    },
  );

  it('swaps hands on a seven and passes them along on a zero', () => {
    const houseRules = { ...defaults, sevenZero: true, jumpIn: false };
    const swapped = sessionApply(
      wildpileGame,
      fixture({
        rules: houseRules,
        hands: [
          [card('7'), card('6', 'green'), card('5', 'blue')],
          [card('1'), card('2', 'blue'), card('4', 'green')],
          [card('9', 'green')],
        ],
      }),
      0,
      'playCard',
      { card: card('7') },
    );
    expect(swapped.session.phase).toMatchObject({ phase: 'choose-target', actor: 0 });

    const taken = sessionApply(wildpileGame, swapped.session, 0, 'chooseTarget', { seat: 1 });
    expect(taken.session.state.hands[0]).toEqual([
      card('1'),
      card('2', 'blue'),
      card('4', 'green'),
    ]);
    expect(taken.session.state.hands[1]).toEqual([card('6', 'green'), card('5', 'blue')]);
    expect(taken.session.state.turn).toBe(1);
    expect(
      taken.fx.filter((event) => event.kind === 'wildpile.transfer').map((event) => event.payload),
    ).toEqual([
      { card: card('6', 'green'), from: 'hand:0', to: 'hand:1', dur: 240 },
      { card: card('1'), from: 'hand:1', to: 'hand:0', dur: 240 },
      { card: card('5', 'blue'), from: 'hand:0', to: 'hand:1', dur: 240 },
      { card: card('2', 'blue'), from: 'hand:1', to: 'hand:0', dur: 240 },
      { card: card('4', 'green'), from: 'hand:1', to: 'hand:0', dur: 240 },
    ]);

    const rotated = sessionApply(
      wildpileGame,
      fixture({
        rules: houseRules,
        discard: [card('0')],
        hands: [
          [card('0', 'blue'), card('6', 'green'), card('5', 'blue')],
          [card('1')],
          [card('9', 'green'), card('8', 'green'), card('4', 'green')],
        ],
      }),
      0,
      'playCard',
      { card: card('0', 'blue') },
    );
    // Hands move one seat along the direction of play: 0 → 1 → 2 → 0.
    expect(rotated.session.state.hands[1]).toEqual([card('6', 'green'), card('5', 'blue')]);
    expect(rotated.session.state.hands[2]).toEqual([card('1')]);
    expect(rotated.session.state.hands[0]).toHaveLength(3);
    expect(rotated.fx.filter((event) => event.kind === 'wildpile.transfer')).toHaveLength(6);
  });

  it('logs turn and match clock expiry, auto-plays, and ranks hands still holding cards', () => {
    const turn = sessionInject(
      wildpileGame,
      fixture(),
      'timeout',
      { kind: 'turn', actor: 0 },
      {
        atMs: defaults.turnTimeSeconds * 1_000,
      },
    );
    expect(turn.rejected).toBeUndefined();
    expect(turn.events[0]).toMatchObject({ move: 'timeout', injected: true });
    expect(turn.fx.some((event) => event.kind === 'wildpile.turn-timeout')).toBe(true);
    expect(turn.session.state.hands[0]).toHaveLength(1);

    const early = sessionInject(
      wildpileGame,
      fixture(),
      'timeout',
      { kind: 'match' },
      {
        atMs: defaults.matchTimeMinutes * 60_000 - 1,
      },
    );
    expect(early.rejected?.code).toBe('match-clock-live');

    const expired = sessionInject(
      wildpileGame,
      fixture(),
      'timeout',
      { kind: 'match' },
      {
        atMs: defaults.matchTimeMinutes * 60_000,
      },
    );
    expect(expired.rejected).toBeUndefined();
    expect(expired.session.status).toBe('ended');
    expect(expired.session.result).toMatchObject({ winner: 2, reason: 'match-timeout' });
    expect(expired.session.result?.rankings.map((entry) => entry.seat)).toEqual([2, 0, 1]);
  });

  it('keeps the turn after a voluntary draw lands something playable', () => {
    const drew = sessionApply(
      wildpileGame,
      fixture({
        hands: [[card('9', 'blue'), card('8', 'blue')], [card('1')], [card('2')]],
        stock: [card('4'), card('7', 'green')],
      }),
      0,
      'draw',
    );

    // red-4-0 matches the active color, so seat 0 still holds the turn.
    expect(drew.session.state.drawnCard).toBe(card('4'));
    expect(drew.session.state.turn).toBe(0);
    const offered = wildpileGame.flow.legalMoves(drew.session.state, drew.session.phase);
    expect(offered.map((move) => move.id).sort()).toEqual(['pass', 'playCard']);

    const passed = sessionApply(wildpileGame, drew.session, 0, 'pass');
    expect(passed.session.state.drawnCard).toBeNull();
    expect(passed.session.state.turn).toBe(1);
  });

  it('removes the pass option when the table forces the play', () => {
    const drew = sessionApply(
      wildpileGame,
      fixture({
        rules: { ...defaults, forcePlay: true },
        hands: [[card('9', 'blue'), card('8', 'blue')], [card('1')], [card('2')]],
        stock: [card('4'), card('7', 'green')],
      }),
      0,
      'draw',
    );

    expect(wildpileGame.flow.legalMoves(drew.session.state, drew.session.phase)).toEqual([
      { id: 'playCard', payload: { card: card('4') } },
    ]);
    expect(sessionApply(wildpileGame, drew.session, 0, 'pass').rejected?.code).toBe('illegal-move');
  });

  it('draws until something is playable when the table asks for it', () => {
    const drew = sessionApply(
      wildpileGame,
      fixture({
        rules: { ...defaults, drawToMatch: true },
        hands: [[card('9', 'blue'), card('8', 'blue')], [card('1')], [card('2')]],
        stock: [card('7', 'green'), card('6', 'blue'), card('4'), card('2', 'green')],
      }),
      0,
      'draw',
    );

    expect(drew.session.state.hands[0]).toHaveLength(5);
    expect(drew.session.state.drawnCard).toBe(card('4'));
  });

  describe('Draw Four challenges', () => {
    const challengeRules = { ...defaults, challengeDrawFour: true, stackDrawFour: false };
    const drawFour = card('wild-draw-four');
    // Deep enough that an eight-card pickup never runs the stock dry mid-test.
    const deepStock = Array.from({ length: 18 }, (_, index) =>
      card(String(Math.floor(index / 2) + 1), 'yellow', index % 2),
    );

    /** Seat 0 plays a Draw Four on a red pile and calls green; seat 1 is on the hook. */
    function playDrawFour(seat0Hand: string[], rules = challengeRules) {
      const played = sessionApply(
        wildpileGame,
        fixture({
          rules,
          activeColor: 'red',
          discard: [card('3')],
          stock: deepStock,
          hands: [
            [drawFour, ...seat0Hand],
            [card('1', 'blue'), card('2', 'blue')],
            [card('9', 'green'), card('8', 'green')],
          ],
        }),
        0,
        'playCard',
        { card: drawFour },
      );
      expect(played.rejected).toBeUndefined();
      return sessionApply(wildpileGame, played.session, 0, 'chooseColor', { color: 'green' });
    }

    it('holds the pickup open for the seat facing it instead of taking it for them', () => {
      const pending = playDrawFour([card('5'), card('6', 'blue')]);

      expect(pending.session.phase).toMatchObject({ phase: 'play', actor: 1 });
      expect(pending.session.state.pendingDraw).toBe(4);
      expect(pending.session.state.challenge).toMatchObject({ accused: 0, challenger: 1 });
      expect(
        wildpileGame.flow.legalMoves(pending.session.state, pending.session.phase).map((m) => m.id),
      ).toContain('challengeDrawFour');
    });

    it('turns the pickup back on the bluffer, and leaves the challenger their turn', () => {
      // Seat 0 still held a red card, so the Draw Four was a bluff.
      const pending = playDrawFour([card('5'), card('6', 'blue')]);
      const called = sessionApply(wildpileGame, pending.session, 1, 'challengeDrawFour');

      expect(called.rejected).toBeUndefined();
      expect(called.fx).toContainEqual(
        expect.objectContaining({
          kind: 'wildpile.challenge',
          payload: expect.objectContaining({
            challenger: 1,
            accused: 0,
            upheld: true,
            amount: 4,
            proof: [card('5')],
          }),
        }),
      );
      expect(called.session.state.hands[0]).toHaveLength(6);
      expect(called.session.state.hands[1]).toHaveLength(2);
      expect(called.session.state.pendingDraw).toBe(0);
      expect(called.session.state.challenge).toBeNull();
      expect(called.session.state.turn).toBe(1);
    });

    it('costs a bad call two extra cards and the turn', () => {
      // Nothing red in hand, so the Draw Four was honest.
      const pending = playDrawFour([card('6', 'blue'), card('7', 'green')]);
      const called = sessionApply(wildpileGame, pending.session, 1, 'challengeDrawFour');

      expect(called.fx).toContainEqual(
        expect.objectContaining({
          kind: 'wildpile.challenge',
          payload: expect.objectContaining({ upheld: false, amount: 6, proof: [] }),
        }),
      );
      expect(called.session.state.hands[1]).toHaveLength(8);
      expect(called.session.state.hands[0]).toHaveLength(2);
      expect(called.session.state.turn).toBe(2);
    });

    it('judges the colour that was live, not the one the bluffer called', () => {
      // A green card is not evidence: green only became live after the play.
      const pending = playDrawFour([card('6', 'green'), card('7', 'green')]);
      const called = sessionApply(wildpileGame, pending.session, 1, 'challengeDrawFour');
      expect(called.session.state.hands[1]).toHaveLength(8);

      // Neither are other wilds, nor a red-matching number in another colour.
      const wilds = playDrawFour([card('wild', 'red', 1), card('3', 'blue')]);
      const alsoBad = sessionApply(wildpileGame, wilds.session, 1, 'challengeDrawFour');
      expect(alsoBad.session.state.hands[1]).toHaveLength(8);
    });

    it('lets the seat accept by drawing, which closes the window', () => {
      const pending = playDrawFour([card('5'), card('6', 'blue')]);
      const taken = sessionApply(wildpileGame, pending.session, 1, 'draw');

      expect(taken.session.state.hands[1]).toHaveLength(6);
      expect(taken.session.state.challenge).toBeNull();
      expect(taken.session.state.turn).toBe(2);
    });

    it('moves the accusation along with a stacked Draw Four', () => {
      const stacking = { ...challengeRules, stackDrawFour: true };
      const pending = playDrawFour([card('5'), card('6', 'blue')], stacking);
      const stacked = sessionApply(
        wildpileGame,
        {
          ...pending.session,
          state: {
            ...pending.session.state,
            hands: pending.session.state.hands.map((cards, seat) =>
              seat === 1 ? [card('wild-draw-four', 'red', 1), card('4', 'blue')] : cards,
            ),
          },
        },
        1,
        'playCard',
        { card: card('wild-draw-four', 'red', 1) },
      );
      const coloured = sessionApply(wildpileGame, stacked.session, 1, 'chooseColor', {
        color: 'blue',
      });

      expect(coloured.session.state.pendingDraw).toBe(8);
      expect(coloured.session.state.challenge).toMatchObject({ accused: 1, challenger: 2 });
      // The live colour when seat 1 stacked was green, and they held no green.
      expect(coloured.session.state.challenge?.colorAtPlay).toBe('green');
      expect(coloured.session.state.challenge?.heldMatches).toEqual([]);
    });

    it('stays out of the way when the table has the rule off, or the room is veiled', () => {
      const off = playDrawFour([card('5')], {
        ...defaults,
        stackDrawFour: false,
        challengeDrawFour: false,
      });
      // No window, so the flow takes the pickup for seat 1 automatically.
      expect(off.session.state.challenge).toBeNull();
      expect(off.session.state.hands[1]).toHaveLength(6);
      expect(off.session.state.turn).toBe(2);

      const veiled = sessionApply(
        wildpileGame,
        fixture({
          veiled: true,
          rules: challengeRules,
          activeColor: 'red',
          discard: [card('3')],
          stock: deepStock,
          hands: [
            [drawFour, card('5')],
            [card('1', 'blue'), card('2', 'blue')],
            [card('9', 'green')],
          ],
        }),
        0,
        'playCard',
        { card: drawFour },
      );
      expect(veiled.session.state.challenge).toBeNull();
    });

    it('refuses a challenge from anyone but the seat on the hook', () => {
      const pending = playDrawFour([card('5'), card('6', 'blue')]);
      expect(
        sessionApply(wildpileGame, pending.session, 2, 'challengeDrawFour').rejected?.code,
      ).toBe('not-your-turn');
    });
  });

  it('deals the swap wilds only when the table turns them on', () => {
    const off = createSession(wildpileGame, { seed: 3, config: defaults, seats: 4 });
    const inPlay = (session: GameSession<WildpileState>) => [
      ...session.state.stock,
      ...session.state.hands.flat(),
      ...session.state.discard,
    ];
    expect(inPlay(off).some((id) => WILDPILE_SWAP_CARD_IDS.includes(id))).toBe(false);
    expect(inPlay(off)).toHaveLength(112);

    const on = createSession(wildpileGame, {
      seed: 3,
      config: { ...defaults, swapCards: true },
      seats: 4,
    });
    expect(inPlay(on)).toHaveLength(116);
  });

  it('publishes all four legal wild colors', () => {
    const state = fixture({
      awaitingColor: 0,
      activeColor: null,
      hands: [[card('1')], [card('2')], [card('3')]],
    }).state;
    const legal = wildpileGame.flow.legalMoves(state, {
      phase: 'choose-color',
      actor: 0,
      round: 1,
    });
    expect(legal.map((move) => (move.payload as { color: string }).color)).toEqual(WILDPILE_COLORS);
  });
});
