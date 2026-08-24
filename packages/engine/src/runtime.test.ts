import { describe, expect, it } from 'vitest';
import { defineConfig } from './config';
import { createSession, replayMatchesLog, replaySession, sessionApply, stateHash } from './runtime';
import {
  Fx,
  stdDeck,
  type AppliedEvent,
  type CardId,
  type ConfigFieldValue,
  type Flow,
  type GameDef,
  type LegalMove,
  type Move,
  type SeatId,
} from './types';
import { addTo, drawFrom, removeFrom, shuffledIds } from './zones';

// --- mini game fixture -----------------------------------------------------

interface MiniRules {
  handSize: number;
  chatty: boolean;
  [key: string]: ConfigFieldValue;
}

interface MiniState {
  seats: number;
  hands: CardId[][];
  stock: CardId[];
  discard: CardId[];
  turn: SeatId;
  ticks: number;
  rolls: number[];
}

const configSchema = defineConfig<MiniRules>(
  [
    { key: 'handSize', kind: 'int', label: 'Hand size', min: 1, max: 5, default: 3 },
    { key: 'chatty', kind: 'toggle', label: 'Chatty', default: false },
  ],
  [{ id: 'quick', label: 'Quick', values: { handSize: 1 } }],
);

const handOf = (state: MiniState, seat: SeatId): CardId[] => state.hands[seat] ?? [];

const draw: Move<MiniState> = {
  validate(state) {
    return state.stock.length > 0 ? true : { code: 'empty-stock', message: 'stock is empty' };
  },
  apply(state, seat, _payload, ctx) {
    const { drawn, rest } = drawFrom(state.stock, 1);
    const card = drawn[0] as CardId;
    ctx.fx.emit(Fx.DrawCard, { card, seat, from: 'stock' });
    return {
      ...state,
      stock: rest,
      hands: state.hands.map((h, i) => (i === seat ? addTo(h, card) : h)),
    };
  },
};

const discard: Move<MiniState> = {
  validate(state, seat, payload) {
    const card = (payload as { card?: unknown } | undefined)?.card;
    if (typeof card !== 'string') return { code: 'bad-payload', message: 'expected {card}' };
    if (!handOf(state, seat).includes(card)) {
      return { code: 'not-in-hand', message: `${card} is not in seat ${seat}'s hand` };
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const card = (payload as { card: CardId }).card;
    ctx.fx.emit(Fx.DiscardCard, { card, seat, to: 'discard' });
    return {
      ...state,
      hands: state.hands.map((h, i) => (i === seat ? removeFrom(h, card) : h)),
      discard: addTo(state.discard, card),
      turn: (seat + 1) % state.seats,
    };
  },
};

const pass: Move<MiniState> = {
  validate: () => true,
  apply(state, seat, _payload, ctx) {
    ctx.fx.emit(Fx.TurnRing, { seat: (seat + 1) % state.seats });
    return { ...state, turn: (seat + 1) % state.seats };
  },
};

const tick: Move<MiniState> = {
  validate: () => true,
  apply(state, _seat, _payload, ctx) {
    const roll = ctx.rng.int(1000);
    ctx.fx.emit('auto.tick', { n: state.ticks + 1 });
    return { ...state, ticks: state.ticks + 1, rolls: [...state.rolls, roll] };
  },
};

const flow: Flow<MiniState> = {
  start(state) {
    return { phase: 'play', actor: 0, round: 1, label: `${state.seats} seats` };
  },
  legalMoves(state, phase) {
    if (phase.actor === null) return [];
    const moves: LegalMove[] = [{ id: 'pass' }];
    if (state.stock.length > 0) moves.push({ id: 'draw' });
    const top = handOf(state, phase.actor)[0];
    if (top !== undefined) moves.push({ id: 'discard', payload: { card: top } });
    return moves;
  },
  advance(state, event) {
    const phase = { phase: 'play', actor: state.turn, round: 1 };
    if (state.ticks >= 4) {
      return {
        phase: { ...phase, actor: null },
        ended: { winner: 0, rankings: [{ seat: 0, rank: 1 }], reason: 'ticks-exhausted' },
      };
    }
    if (event.move === 'draw') {
      return { phase, autoMoves: [{ seat: null, move: 'tick', reason: 'post-draw' }] };
    }
    return { phase };
  },
};

const miniGame: GameDef<MiniState, MiniRules> = {
  id: 'mini',
  howToPlay: { summary: 'test stub', objective: 'test stub', sections: [] },
  configSchema,
  setup({ config, seats, rng, fx }) {
    const ids = shuffledIds(stdDeck(), rng);
    const hands: CardId[][] = [];
    let cursor = 0;
    for (let seat = 0; seat < seats; seat++) {
      const hand = ids.slice(cursor, cursor + config.handSize);
      cursor += config.handSize;
      for (const card of hand) fx.emit(Fx.DealCard, { card, to: `hand:${seat}` });
      hands.push(hand);
    }
    return {
      seats,
      hands,
      stock: ids.slice(cursor + 1),
      discard: [ids[cursor] as CardId],
      turn: 0,
      ticks: 0,
      rolls: [],
    };
  },
  moves: { draw, discard, pass, tick },
  flow,
  playerView(state, seat) {
    return { ...state, hands: state.hands.map((h, i) => (i === seat ? h : h.map(() => '??'))) };
  },
  end(state) {
    return state.stock.length === 0
      ? { winner: null, rankings: [], reason: 'stock-exhausted' }
      : null;
  },
  bots: [],
};

const OPTS = { seed: 90210, config: configSchema.defaults(), seats: 3 };

type Script = readonly { seat: SeatId; move: string; payload?: unknown }[];

const SCRIPT: Script = [
  { seat: 0, move: 'draw' },
  { seat: 0, move: 'discard' },
  { seat: 1, move: 'pass' },
  { seat: 2, move: 'draw' },
  { seat: 2, move: 'discard' },
  { seat: 0, move: 'pass' },
  { seat: 1, move: 'draw' },
];

function runScript(script: Script = SCRIPT, seed = OPTS.seed) {
  let session = createSession(miniGame, { ...OPTS, seed });
  const fx: string[][] = [];
  const rejected: string[] = [];
  for (const step of script) {
    const outcome = sessionApply(miniGame, session, step.seat, step.move, step.payload);
    if (outcome.rejected) {
      rejected.push(outcome.rejected.code);
      continue;
    }
    fx.push(outcome.fx.map((e) => e.kind));
    session = outcome.session;
  }
  return { session, fx, rejected };
}

// --- tests -----------------------------------------------------------------

describe('createSession', () => {
  it('runs setup with the seeded rng and opens the flow', () => {
    const session = createSession(miniGame, OPTS);
    expect(session.status).toBe('playing');
    expect(session.phase).toEqual({ phase: 'play', actor: 0, round: 1, label: '3 seats' });
    expect(session.log).toEqual([]);
    expect(session.state.hands.map((h) => h.length)).toEqual([3, 3, 3]);
    expect(session.state.stock).toHaveLength(52 - 9 - 1);
    expect(session.botsEnabled(0)).toBe(true);
    expect(session.setupFx?.map((e) => e.kind)).toEqual(Array(9).fill(Fx.DealCard));
  });

  it('resolves the config through the schema', () => {
    const session = createSession(miniGame, {
      ...OPTS,
      config: { handSize: 99, chatty: true } as MiniRules,
    });
    expect(session.config).toEqual({ handSize: 5, chatty: true });
  });
});

describe('determinism', () => {
  it('same seed + same actions => identical state and hash', () => {
    const a = runScript();
    const b = runScript();
    expect(a.session.state).toEqual(b.session.state);
    expect(stateHash(a.session.state)).toBe(stateHash(b.session.state));
    expect(a.session.log.map((e) => e.hash)).toEqual(b.session.log.map((e) => e.hash));
  });

  it('different seeds diverge', () => {
    const a = runScript(SCRIPT, 1);
    const b = runScript(SCRIPT, 2);
    expect(stateHash(a.session.state)).not.toBe(stateHash(b.session.state));
  });

  it('auto-move rng is seeded from the event sequence, not shared mutable state', () => {
    const a = runScript();
    const b = runScript();
    expect(a.session.state.rolls).toEqual(b.session.state.rolls);
    expect(a.session.state.rolls.length).toBeGreaterThan(1);
  });
});

describe('sessionApply', () => {
  it('logs the player event followed by flow autoMoves', () => {
    const session = createSession(miniGame, OPTS);
    const outcome = sessionApply(miniGame, session, 0, 'draw');
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.events.map((e) => [e.move, e.seat, e.automatic])).toEqual([
      ['draw', 0, undefined],
      ['tick', null, true],
    ]);
    expect(outcome.events.map((e) => e.seq)).toEqual([0, 1]);
    expect(outcome.events.every((e) => typeof e.hash === 'string')).toBe(true);
    expect(outcome.session.lastAppliedHash).toBe(outcome.events[1]?.hash);
    expect(outcome.session.state.ticks).toBe(1);
  });

  it('fills payload from the legal move when the caller omits it', () => {
    const session = createSession(miniGame, OPTS);
    const expected = session.state.hands[0]?.[0];
    const outcome = sessionApply(miniGame, session, 0, 'discard');
    expect(outcome.events[0]?.payload).toEqual({ card: expected });
    expect(outcome.session.state.discard[0]).toBe(expected);
  });

  it('collects fx in emit order and clears them between actions', () => {
    const session = createSession(miniGame, OPTS);
    const first = sessionApply(miniGame, session, 0, 'draw');
    expect(first.fx.map((e) => e.kind)).toEqual([Fx.DrawCard, 'auto.tick']);

    const second = sessionApply(miniGame, first.session, 0, 'discard');
    expect(second.fx.map((e) => e.kind)).toEqual([Fx.DiscardCard]);
  });

  it('rejects out-of-turn seats without touching state', () => {
    const session = createSession(miniGame, OPTS);
    const outcome = sessionApply(miniGame, session, 2, 'draw');
    expect(outcome.rejected?.code).toBe('not-your-turn');
    expect(outcome.session).toBe(session);
    expect(outcome.events).toEqual([]);
    expect(outcome.fx).toEqual([]);
  });

  it('rejects moves the flow does not list', () => {
    const session = createSession(miniGame, OPTS);
    expect(sessionApply(miniGame, session, 0, 'tick').rejected?.code).toBe('illegal-move');
    expect(sessionApply(miniGame, session, 0, 'nonsense').rejected?.code).toBe('illegal-move');
  });

  it('a failed validate leaves state, log and hash untouched', () => {
    const session = createSession(miniGame, OPTS);
    const before = stateHash(session.state);
    const outcome = sessionApply(miniGame, session, 0, 'discard', { card: 'NOPE' });
    expect(outcome.rejected).toEqual({
      code: 'not-in-hand',
      message: "NOPE is not in seat 0's hand",
    });
    expect(outcome.session).toBe(session);
    expect(outcome.session.log).toHaveLength(0);
    expect(stateHash(outcome.session.state)).toBe(before);
  });

  it('ends the match when the flow reports a result and refuses later moves', () => {
    const drawScript: Script = Array.from({ length: 5 }, (_, i) => ({
      seat: (i % 3) as SeatId,
      move: 'draw',
    }));
    let session = createSession(miniGame, OPTS);
    for (const step of drawScript) {
      const outcome = sessionApply(miniGame, session, session.phase.actor ?? step.seat, step.move);
      if (!outcome.rejected) session = outcome.session;
    }
    expect(session.status).toBe('ended');
    expect(session.result?.reason).toBe('ticks-exhausted');
    expect(session.phase.actor).toBeNull();

    const after = sessionApply(miniGame, session, 0, 'draw');
    expect(after.rejected?.code).toBe('match-ended');
    expect(after.session).toBe(session);
  });
});

describe('replaySession', () => {
  it('reproduces live state and hashes from the log alone', () => {
    const live = runScript();
    const replayed = replaySession(miniGame, OPTS.seed, live.session.log, {
      config: live.session.config,
      seats: live.session.seats,
    });

    expect(replayed.state).toEqual(live.session.state);
    expect(stateHash(replayed.state)).toBe(stateHash(live.session.state));
    expect(replayed.phase).toEqual(live.session.phase);
    expect(replayed.log.map((e) => e.hash)).toEqual(live.session.log.map((e) => e.hash));
    expect(replayed.lastAppliedHash).toBe(live.session.log[live.session.log.length - 1]?.hash);
    expect(replayMatchesLog(replayed.lastAppliedHash, live.session.log)).toBe(true);
  });

  it('replays automatic events without re-deriving them', () => {
    const live = runScript();
    const autos = live.session.log.filter((e) => e.automatic === true);
    expect(autos.length).toBeGreaterThan(0);
    const replayed = replaySession(miniGame, OPTS.seed, live.session.log, {
      config: live.session.config,
      seats: live.session.seats,
    });
    expect(replayed.log).toHaveLength(live.session.log.length);
    expect(replayed.state.ticks).toBe(live.session.state.ticks);
  });

  it('reaches the same ended result as the live run', () => {
    let session = createSession(miniGame, OPTS);
    for (let i = 0; i < 6; i++) {
      const actor = session.phase.actor;
      if (actor === null) break;
      const outcome = sessionApply(miniGame, session, actor, 'draw');
      if (!outcome.rejected) session = outcome.session;
    }
    expect(session.status).toBe('ended');

    const replayed = replaySession(miniGame, OPTS.seed, session.log, {
      config: session.config,
      seats: session.seats,
    });
    expect(replayed.status).toBe('ended');
    expect(replayed.result).toEqual(session.result);
    expect(stateHash(replayed.state)).toBe(stateHash(session.state));
  });

  it('surfaces divergence as a hash mismatch rather than throwing', () => {
    const live = runScript();
    const tampered: AppliedEvent[] = live.session.log.map((e) => ({ ...e }));
    const last = tampered[tampered.length - 1];
    if (last) last.hash = 'deadbeef';

    const replayed = replaySession(miniGame, OPTS.seed, tampered, {
      config: live.session.config,
      seats: live.session.seats,
    });
    expect(replayMatchesLog(replayed.lastAppliedHash, tampered)).toBe(false);
    expect(replayed.state).toEqual(live.session.state);
  });

  it('derives config and seats when opts are omitted', () => {
    const live = runScript();
    const replayed = replaySession(miniGame, OPTS.seed, live.session.log);
    expect(replayed.seats).toBe(3);
    expect(replayed.config).toEqual(configSchema.defaults());
    expect(stateHash(replayed.state)).toBe(stateHash(live.session.state));
  });
});
