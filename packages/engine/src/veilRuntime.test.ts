import { describe, expect, it } from 'vitest';
import { createSession, replaySession, sessionApply, stateHash } from './runtime';
import { dealOrder, veilHandles, veiledDeckOrder } from './veil';
import { defineConfig } from './config';
import { addTo, removeFrom } from './zones';
import { stdDeck, type CardId, type GameDef, type RuleValues } from './types';

const DECK = stdDeck();

interface ToyState {
  seats: number;
  hands: CardId[][];
  stock: CardId[];
  discard: CardId[];
  turn: number;
}

type ToyRules = RuleValues;

const toyConfig = defineConfig<ToyRules>([], []);

/** A two-move game: play a card face up, or draw one face down. */
const toy: GameDef<ToyState, ToyRules> = {
  id: 'toy',
  configSchema: toyConfig,
  howToPlay: { summary: 'toy', objective: 'toy', sections: [] },
  veil: {
    deck: () => DECK,
    publicSetupFrom: (seats) => seats * 3,
    publicSetupReady: (opened) => opened.length >= 1,
  },
  setup(ctx) {
    const order = dealOrder(ctx, DECK);
    const hands: CardId[][] = [];
    for (let seat = 0; seat < ctx.seats; seat++) hands.push(order.slice(seat * 3, seat * 3 + 3));
    const flip = order[ctx.seats * 3] as CardId;
    return {
      seats: ctx.seats,
      hands,
      stock: order.slice(ctx.seats * 3 + 1),
      discard: [flip],
      turn: 0,
    };
  },
  moves: {
    play: {
      validate(state, seat, payload) {
        const card = (payload as { card?: unknown }).card;
        if (typeof card !== 'string') return { code: 'bad-payload', message: 'expected {card}' };
        return (state.hands[seat] ?? []).includes(card)
          ? true
          : { code: 'not-in-hand', message: `${card} is not held` };
      },
      apply(state, seat, payload, ctx) {
        const card = (payload as { card: CardId }).card;
        ctx.fx.emit('toy.play', { card, seat });
        return {
          ...state,
          hands: state.hands.map((h, i) => (i === seat ? removeFrom(h, card) : h)),
          discard: addTo(state.discard, card),
          turn: (seat + 1) % state.seats,
        };
      },
    },
    draw: {
      validate: () => true,
      apply(state, seat) {
        const card = state.stock[0] as CardId;
        return {
          ...state,
          hands: state.hands.map((h, i) => (i === seat ? addTo(h, card) : h)),
          stock: state.stock.slice(1),
          turn: (seat + 1) % state.seats,
        };
      },
    },
  },
  flow: {
    start: (state) => ({ phase: 'turn', actor: state.turn, round: 1 }),
    legalMoves: (state, phase) =>
      phase.actor === null
        ? []
        : [
            ...(state.hands[phase.actor] ?? []).map((card) => ({ id: 'play', payload: { card } })),
            { id: 'draw' },
          ],
    advance: (state) => ({ phase: { phase: 'turn', actor: state.turn, round: 1 } }),
  },
  playerView: (state) => state,
  end: () => null,
  bots: [],
};

function veiledSession(seats = 2) {
  const deckOrder = veiledDeckOrder(toy.veil!, seats, ['S12']);
  return {
    deckOrder,
    session: createSession(toy, {
      seed: 3,
      config: toyConfig.defaults(),
      seats,
      veiled: true,
      deckOrder,
    }),
  };
}

describe('veiled sessions', () => {
  it('deals opaque handles and keeps the publicly opened setup card real', () => {
    const { session } = veiledSession();
    expect(session.state.hands[0]).toEqual(['v#0', 'v#1', 'v#2']);
    expect(session.state.hands[1]).toEqual(['v#3', 'v#4', 'v#5']);
    expect(session.state.discard).toEqual(['S12']);
    expect(session.state.stock[0]).toBe('v#7');
    expect(session.veiled).toBe(true);
  });

  it('refuses to open a veiled session without the ceremony order', () => {
    expect(() =>
      createSession(toy, { seed: 3, config: toyConfig.defaults(), seats: 2, veiled: true }),
    ).toThrow(/ceremony deck order/);
  });

  it('deals real cards when the room is open', () => {
    const open = createSession(toy, { seed: 3, config: toyConfig.defaults(), seats: 2 });
    expect(open.state.hands[0]?.every((card) => card.startsWith('v#'))).toBe(false);
    expect(open.veiled).toBe(false);
  });
});

describe('reveals through sessionApply', () => {
  it('opens a handle before validation so a hidden card becomes playable', () => {
    const { session } = veiledSession();
    const outcome = sessionApply(toy, session, 0, 'play', { card: 'H4' }, {
      reveals: [['v#1', 'H4']],
    });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.hands[0]).toEqual(['v#0', 'v#2']);
    expect(outcome.session.state.discard).toEqual(['H4', 'S12']);
  });

  it('records the opening on the event so the log stays self-contained', () => {
    const { session } = veiledSession();
    const outcome = sessionApply(toy, session, 0, 'play', { card: 'H4' }, {
      reveals: [['v#1', 'H4']],
    });
    expect(outcome.events[0]?.reveals).toEqual([['v#1', 'H4']]);
  });

  it('rejects playing a card whose handle was never opened', () => {
    const { session } = veiledSession();
    const outcome = sessionApply(toy, session, 0, 'play', { card: 'H4' });
    expect(outcome.rejected?.code).toBe('not-in-hand');
  });

  it('rejects an opening whose face is not a card in the deck', () => {
    const { session } = veiledSession();
    const outcome = sessionApply(toy, session, 0, 'play', { card: 'JOKER' }, {
      reveals: [['v#1', 'JOKER']],
    });
    expect(outcome.rejected?.code).toBe('card-not-in-deck');
  });

  it('rejects an opening of a handle that is not in play', () => {
    const { session } = veiledSession();
    const outcome = sessionApply(toy, session, 0, 'play', { card: 'H4' }, {
      reveals: [['v#500', 'H4']],
    });
    expect(outcome.rejected?.code).toBe('unknown-handle');
  });

  it('rejects an opening that duplicates a visible card', () => {
    const { session } = veiledSession();
    const outcome = sessionApply(toy, session, 0, 'play', { card: 'S12' }, {
      reveals: [['v#1', 'S12']],
    });
    expect(outcome.rejected?.code).toBe('card-already-open');
  });

  it('refuses reveals in an open room, where they would be a free card swap', () => {
    const open = createSession(toy, { seed: 3, config: toyConfig.defaults(), seats: 2 });
    const held = open.state.hands[0]![0] as CardId;
    const outcome = sessionApply(toy, open, 0, 'play', { card: held }, {
      reveals: [['v#0', 'H4']],
    });
    expect(outcome.rejected?.code).toBe('not-veiled');
  });
});

describe('replay of a veiled round', () => {
  it('reproduces the exact board from seed, ceremony order and log', () => {
    const { deckOrder, session } = veiledSession();
    let current = session;
    const steps: Array<[number, string, unknown, [CardId, CardId][]]> = [
      [0, 'play', { card: 'H4' }, [['v#1', 'H4']]],
      [1, 'draw', undefined, []],
      [0, 'draw', undefined, []],
      [1, 'play', { card: 'C7' }, [['v#3', 'C7']]],
    ];
    for (const [seat, move, payload, reveals] of steps) {
      const outcome = sessionApply(toy, current, seat, move, payload, { reveals });
      expect(outcome.rejected).toBeUndefined();
      current = outcome.session;
    }

    const replayed = replaySession(toy, 3, current.log, {
      config: toyConfig.defaults(),
      seats: 2,
      veiled: true,
      deckOrder,
    });
    expect(stateHash(replayed.state)).toBe(stateHash(current.state));
    expect(replayed.state.discard).toEqual(['C7', 'H4', 'S12']);
  });

  it('leaves cards that were never opened veiled after replay', () => {
    const { deckOrder, session } = veiledSession();
    const played = sessionApply(toy, session, 0, 'play', { card: 'H4' }, {
      reveals: [['v#1', 'H4']],
    }).session;
    const replayed = replaySession(toy, 3, played.log, {
      config: toyConfig.defaults(),
      seats: 2,
      veiled: true,
      deckOrder,
    });
    expect(replayed.state.hands[1]).toEqual(['v#3', 'v#4', 'v#5']);
    expect(JSON.stringify(replayed.state.hands[1])).not.toContain('H');
  });

  it('diverges loudly when a replay is handed the wrong ceremony order', () => {
    const { session } = veiledSession();
    const played = sessionApply(toy, session, 0, 'play', { card: 'H4' }, {
      reveals: [['v#1', 'H4']],
    }).session;
    const wrong = replaySession(toy, 3, played.log, {
      config: toyConfig.defaults(),
      seats: 2,
      veiled: true,
      deckOrder: veilHandles(52),
    });
    expect(wrong.state.discard).not.toEqual(played.state.discard);
  });
});
