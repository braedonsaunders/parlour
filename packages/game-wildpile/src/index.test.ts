import {
  createFx,
  createSession,
  makeRng,
  replaySession,
  sessionApply,
  stateHash,
  type GameSession,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import {
  GAME_ID,
  WILDPILE_COLORS,
  wildpileConfig,
  wildpileDeck,
  wildpileGame,
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
    interrupt: null,
    winner: null,
    rules: defaults,
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
  it('defines the complete unique 108-card custom deck', () => {
    expect(GAME_ID).toBe('wildpile');
    expect(wildpileDeck.cardIds).toHaveLength(108);
    expect(new Set(wildpileDeck.cardIds)).toHaveLength(108);
    expect(
      Object.values(wildpileDeck.faces).filter((face) => face.meta?.kind === 'wild'),
    ).toHaveLength(4);
    expect(
      Object.values(wildpileDeck.faces).filter((face) => face.meta?.kind === 'wild-draw-four'),
    ).toHaveLength(4);
  });

  it('deals seven each, starts on a number, emits deal fx, and is seed-stable', () => {
    const a = createSession(wildpileGame, { seed: 2026, config: defaults, seats: 4 });
    const b = createSession(wildpileGame, { seed: 2026, config: defaults, seats: 4 });
    expect(a.state.hands.map((hand) => hand.length)).toEqual([7, 7, 7, 7]);
    expect(a.state.stock).toHaveLength(79);
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

    const jumped = sessionApply(wildpileGame, played.session, 1, 'playCard', {
      card: card('5', 'red', 1),
    });
    expect(jumped.rejected).toBeUndefined();
    expect(jumped.session.state.hands[1]).toEqual([card('2', 'blue')]);
    expect(jumped.session.state.turn).toBe(2);
  });

  it('supports skip, reverse, draw-two, and deterministic stock recycling', () => {
    const play = wildpileGame.moves.playCard;
    const fx = createFx();
    const skipped = play?.apply(
      fixture({ hands: [[card('skip')], [card('1')], [card('2')]] }).state,
      0,
      { card: card('skip') },
      { rng: makeRng(1), fx },
    );
    expect(skipped?.turn).toBe(2);
    expect(fx.events.map((event) => event.kind)).toContain('wildpile.skip');

    const reversed = play?.apply(
      fixture({ hands: [[card('reverse')], [card('1')], [card('2')]] }).state,
      0,
      { card: card('reverse') },
      { rng: makeRng(1), fx: createFx() },
    );
    expect(reversed).toMatchObject({ direction: -1, turn: 2 });

    const drawState = fixture({
      hands: [[card('draw-two'), card('6', 'green')], [card('1')], [card('2')]],
      stock: [],
      discard: [card('3'), card('7', 'blue'), card('8', 'yellow')],
    });
    const stacked = sessionApply(wildpileGame, drawState, 0, 'playCard', {
      card: card('draw-two'),
    });
    expect(stacked.session.state.pendingDraw).toBe(2);
    const drawn = sessionApply(wildpileGame, stacked.session, 1, 'draw');
    expect(drawn.rejected).toBeUndefined();
    expect(drawn.session.state.hands[1]).toHaveLength(3);
    expect(drawn.session.state.discard).toHaveLength(1);
    expect(drawn.fx.map((event) => event.kind)).toContain('stock.shuffle');
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
      turn: 1,
      activeColor: 'blue',
      pendingDraw: 4,
      pendingKind: 'wild-draw-four',
      hands: [[card('1')], [card('wild-draw-four', 'red', 1)], [card('2')]],
    });
    const stack = sessionApply(wildpileGame, pending, 1, 'playCard', {
      card: card('wild-draw-four', 'red', 1),
    });
    expect(stack.rejected).toBeUndefined();
    expect(stack.session.state.pendingDraw).toBe(8);

    const noStackState = fixture({
      ...pending.state,
      rules: { ...defaults, stacking: false },
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
