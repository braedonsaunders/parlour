import { describe, expect, it } from 'vitest';
import { defineConfig } from './config';
import {
  stdDeck,
  type ConfigFieldValue,
  type Flow,
  type GameDef,
  type Move,
  type SeatId,
} from './types';
import { shuffledIds } from './zones';
import { createSession, sessionApply, stateHash } from './runtime';
import { undoPolicy, undoSession } from './undo';

interface Rules {
  handSize: number;
  [key: string]: ConfigFieldValue;
}

type State = {
  seats: number;
  hands: string[][];
  discard: string[];
  turn: number;
  ticks: number;
  rolls: number[];
};

const configSchema = defineConfig<Rules>([
  { key: 'handSize', kind: 'int', label: 'Hand size', min: 1, max: 5, default: 3 },
]);

const play: Move<State> = {
  validate(state, seat, payload) {
    const card = (payload as { card?: unknown } | undefined)?.card;
    if (typeof card !== 'string') return { code: 'bad-payload', message: 'expected {card}' };
    if (!(state.hands[seat] ?? []).includes(card)) {
      return { code: 'not-in-hand', message: `${card} is not in seat ${seat}'s hand` };
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const card = (payload as { card: string }).card;
    ctx.fx.emit('card.discard', { card, seat });
    return {
      ...state,
      hands: state.hands.map((hand, i) => (i === seat ? hand.filter((c) => c !== card) : hand)),
      discard: [card, ...state.discard],
      turn: (seat + 1) % state.seats,
    };
  },
};

/** An automatic move, so undo has a settle tail to keep together with its cause. */
const tick: Move<State> = {
  validate: () => true,
  apply(state, _seat, _payload, ctx) {
    return { ...state, ticks: state.ticks + 1, rolls: [...state.rolls, ctx.rng.int(1_000)] };
  },
};

const flow: Flow<State> = {
  start: (state) => ({ phase: 'play', actor: 0, round: 1, label: `${state.seats} seats` }),
  legalMoves(state, phase) {
    if (phase.actor === null) return [];
    return (state.hands[phase.actor] ?? []).map((card) => ({ id: 'play', payload: { card } }));
  },
  advance(state, event) {
    const phase = { phase: 'play', actor: state.turn, round: 1 };
    if (event.move === 'play') {
      return { phase, autoMoves: [{ seat: null, move: 'tick', reason: 'post-play' }] };
    }
    return { phase };
  },
};

const game: GameDef<State, Rules> = {
  id: 'undo-test',
  howToPlay: { summary: 'test stub', objective: 'test stub', sections: [] },
  configSchema,
  setup({ config, seats, rng }) {
    const ids = shuffledIds(stdDeck(), rng);
    const hands: string[][] = [];
    for (let seat = 0; seat < seats; seat++) {
      hands.push(ids.slice(seat * config.handSize, (seat + 1) * config.handSize));
    }
    return { seats, hands, discard: [], turn: 0, ticks: 0, rolls: [] };
  },
  moves: { play, tick },
  flow,
  playerView: (state) => state,
  end: () => null,
  bots: [],
};

const OPTS = { seed: 4242, config: configSchema.defaults(), seats: 3 };

/** Plays `count` legal moves and returns every position along the way. */
function playOut(count: number) {
  let session = createSession(game, OPTS);
  const positions = [session];
  for (let i = 0; i < count; i++) {
    const seat = session.phase.actor as SeatId;
    const move = flow.legalMoves(session.state, session.phase)[0]!;
    session = sessionApply(game, session, seat, move.id, move.payload).session;
    positions.push(session);
  }
  return { session, positions };
}

describe('undoSession', () => {
  it('lands on the exact position, not an approximation of it', () => {
    const { session, positions } = playOut(3);
    const back = undoSession(game, session);
    const before = positions[2]!;

    expect(back.state).toEqual(before.state);
    expect(stateHash(back.state)).toBe(stateHash(before.state));
    expect(back.phase).toEqual(before.phase);
  });

  it('takes the automatic tail with the move that caused it', () => {
    const { session } = playOut(2);
    const back = undoSession(game, session);
    // Never between a move and its settle: the last event left standing is the
    // tick that finished the previous player's turn.
    expect(back.log.at(-1)?.automatic).toBe(true);
    expect(back.state.ticks).toBe(1);
  });

  it('replays into rng streams a later move will draw from', () => {
    const { session } = playOut(3);
    const back = undoSession(game, session);
    const seat = back.phase.actor as SeatId;
    const move = flow.legalMoves(back.state, back.phase)[0]!;
    const redone = sessionApply(game, back, seat, move.id, move.payload).session;

    // Replaying the same choice has to reproduce the same board, rolls
    // included, or undo would be quietly reshuffling the game underneath.
    expect(redone.state).toEqual(session.state);
  });

  it('rewinds to the opening deal but not past it', () => {
    const { session, positions } = playOut(2);
    expect(undoSession(game, session, { steps: 2 }).state).toEqual(positions[0]!.state);
    expect(() => undoSession(game, session, { steps: 3 })).toThrow('with 2 available');
  });

  it('refuses a veiled round rather than handing a reveal back', () => {
    const { session } = playOut(1);
    const veiled = { ...session, veiled: true };
    expect(() => undoSession(game, veiled)).toThrow('cannot be undone');
    expect(undoPolicy(veiled).available).toBe(false);
  });
});
