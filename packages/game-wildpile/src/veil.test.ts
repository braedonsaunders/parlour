import { describe, expect, it } from 'vitest';
import {
  createSession,
  replaySession,
  sessionApply,
  stateHash,
  veiledDeckOrder,
  type CardId,
} from '@parlour/engine';
import { wildpileConfig, wildpileGame, type WildpileState } from './index';
import { wildpileFace } from './deck';

const defaults = wildpileConfig.defaults();

/** A number card the room opens in public to start the pile. */
const STARTER: CardId = 'red-5-0';

function veiled(seats = 2, config = defaults) {
  const deckOrder = veiledDeckOrder(wildpileGame.veil!, seats, [STARTER], config);
  return {
    deckOrder,
    session: createSession(wildpileGame, {
      seed: 91,
      config,
      seats,
      veiled: true,
      deckOrder,
    }),
  };
}

describe('wildpile under Veil', () => {
  it('deals opaque hands and starts on the publicly opened number card', () => {
    const { session } = veiled();
    const state = session.state as WildpileState;
    expect(state.veiled).toBe(true);
    expect(state.hands.flat().every((card) => card.startsWith('v#'))).toBe(true);
    expect(state.discard).toEqual([STARTER]);
    expect(state.activeColor).toBe('red');
    expect(state.stock.every((card) => card.startsWith('v#'))).toBe(true);
  });

  it('keeps opening setup cards until it finds a number to start on', () => {
    const support = wildpileGame.veil!;
    expect(support.publicSetupReady(['wild-0'], 2, defaults)).toBe(false);
    expect(support.publicSetupReady(['wild-0', 'red-skip-0'], 2, defaults)).toBe(false);
    expect(support.publicSetupReady(['wild-0', 'red-5-0'], 2, defaults)).toBe(true);
    expect(support.publicSetupFrom(3, defaults)).toBe(3 * defaults.handSize);
  });

  it('reads a handle as a face that matches nothing rather than throwing', () => {
    const face = wildpileFace('v#7');
    expect(face.meta.kind).toBe('veiled');
    expect(face.color).toBeUndefined();
  });

  it('treats every veiled card as unplayable until it is opened', () => {
    const { session } = veiled();
    const legal = wildpileGame.flow.legalMoves(session.state, session.phase).map((m) => m.id);
    expect(legal).not.toContain('playCard');
    expect(legal).toContain('draw');
  });

  it('plays a card by opening it, and the pile takes the real face', () => {
    const { session } = veiled();
    const handle = (session.state as WildpileState).hands[0]![0]!;
    const outcome = sessionApply(
      wildpileGame,
      session,
      0,
      'playCard',
      { card: 'red-9-0' },
      {
        reveals: [[handle, 'red-9-0']],
      },
    );
    expect(outcome.rejected).toBeUndefined();
    const state = outcome.session.state as WildpileState;
    expect(state.discard[0]).toBe('red-9-0');
    expect(state.activeColor).toBe('red');
    expect(state.hands[0]!.every((card) => card.startsWith('v#'))).toBe(true);
    expect(state.hands[1]!.every((card) => card.startsWith('v#'))).toBe(true);
  });

  it('opens and drops every matching-color card carried by Drop All', () => {
    const { session } = veiled();
    const state = session.state as WildpileState;
    const [dropHandle, numberHandle, keepHandle] = state.hands[0]!;
    const outcome = sessionApply(
      wildpileGame,
      session,
      0,
      'playCard',
      { card: 'red-discard-all-0' },
      {
        reveals: [
          [dropHandle!, 'red-discard-all-0'],
          [numberHandle!, 'red-9-0'],
          [keepHandle!, 'blue-9-0'],
        ],
      },
    );

    expect(outcome.rejected).toBeUndefined();
    const dropped = outcome.session.state as WildpileState;
    expect(dropped.discard.slice(0, 2)).toEqual(['red-discard-all-0', 'red-9-0']);
    expect(dropped.hands[0]).toContain('blue-9-0');
  });

  it('refuses a play whose opened card does not match the pile', () => {
    const { session } = veiled();
    const handle = (session.state as WildpileState).hands[0]![0]!;
    const outcome = sessionApply(
      wildpileGame,
      session,
      0,
      'playCard',
      { card: 'blue-9-0' },
      {
        reveals: [[handle, 'blue-9-0']],
      },
    );
    // Opening the card does not make it legal — a blue 9 on a red 5 is still
    // nothing, so the move never reaches the log.
    expect(outcome.rejected?.code).toBe('illegal-move');
    expect(outcome.events).toEqual([]);
  });

  it('refuses a play that names a card without opening a handle for it', () => {
    const { session } = veiled();
    const outcome = sessionApply(wildpileGame, session, 0, 'playCard', { card: 'red-9-0' });
    expect(outcome.rejected?.code).toBe('illegal-move');
  });
});

/*
 * Reported from a real table: four cards, a Drop All that would have taken the
 * seat to one, the Last card button correctly lit — and pressing it produced
 * "move callLastCard is not legal right now".
 *
 * The owner's client could see its own hand and offered the move honestly. The
 * host, which decides legality, sees handles and could not confirm it. Under
 * Veil the seat is taken at its word, because the host must not be able to read
 * the hand it would need to read in order to judge.
 */
describe('calling last card on a veiled table', () => {
  it('lets a seat arm protection the host cannot verify', () => {
    const { session } = veiled();
    const state = session.state as WildpileState;
    const actor = state.turn;

    expect(state.hands[actor]!.every((card) => card.startsWith('v#'))).toBe(true);
    expect(
      wildpileGame.flow.legalMoves(state, session.phase).some((move) => move.id === 'callLastCard'),
    ).toBe(true);

    const armed = sessionApply(wildpileGame, session, actor, 'callLastCard');
    expect(armed.rejected).toBeUndefined();
    expect((armed.session.state as WildpileState).calledLastCard[actor]).toBe(true);
  });

  it('still refuses a second call, so the declaration stays a single act', () => {
    const { session } = veiled();
    const actor = (session.state as WildpileState).turn;
    const armed = sessionApply(wildpileGame, session, actor, 'callLastCard');

    const again = sessionApply(wildpileGame, armed.session, actor, 'callLastCard');
    expect(again.rejected?.code).toBe('illegal-move');
  });

  /*
   * The half that Veil does not weaken: hand SIZE stays visible even when the
   * faces do not, so a seat that forgets to call is still caught and still pays
   * for it. That is the part of the rule worth protecting.
   */
  it('keeps the penalty for reaching one card unprotected', () => {
    const { session } = veiled();
    const state = session.state as WildpileState;
    expect(state.hands.every((cards) => cards.length === defaults.handSize)).toBe(true);
    expect(state.calledLastCard.every((armed) => armed === false)).toBe(true);
  });
});

describe('veiled jump-in', () => {
  const jumpy = wildpileConfig.resolve({ jumpIn: true, sevenZero: false, swapCards: false });

  it('opens the window to every seat, because the table cannot see who matches', () => {
    const { session } = veiled(3, jumpy);
    const handle = (session.state as WildpileState).hands[0]![0]!;
    const played = sessionApply(
      wildpileGame,
      session,
      0,
      'playCard',
      { card: 'red-9-0' },
      {
        reveals: [[handle, 'red-9-0']],
      },
    ).session;
    const state = played.state as WildpileState;
    expect(state.interrupt?.card).toBe('red-9-0');
    expect(state.interrupt?.candidates).toEqual([1, 2]);
  });

  it('lets a seat with nothing decline, handing the turn on', () => {
    const { session } = veiled(3, jumpy);
    const handle = (session.state as WildpileState).hands[0]![0]!;
    let current = sessionApply(
      wildpileGame,
      session,
      0,
      'playCard',
      { card: 'red-9-0' },
      {
        reveals: [[handle, 'red-9-0']],
      },
    ).session;
    current = sessionApply(wildpileGame, current, 1, 'declineJump').session;
    current = sessionApply(wildpileGame, current, 2, 'declineJump').session;
    const state = current.state as WildpileState;
    expect(state.interrupt).toBeNull();
    expect(state.turn).toBe(1);
  });

  it('only accepts a jump whose opened card is an exact match', () => {
    const { session } = veiled(3, jumpy);
    const handle = (session.state as WildpileState).hands[0]![0]!;
    const played = sessionApply(
      wildpileGame,
      session,
      0,
      'playCard',
      { card: 'red-9-0' },
      {
        reveals: [[handle, 'red-9-0']],
      },
    ).session;
    const jumper = (played.state as WildpileState).hands[1]![0]!;
    expect(
      sessionApply(
        wildpileGame,
        played,
        1,
        'playCard',
        { card: 'blue-9-0' },
        {
          reveals: [[jumper, 'blue-9-0']],
        },
      ).rejected?.code,
    ).toBe('illegal-move');
    const good = sessionApply(
      wildpileGame,
      played,
      1,
      'playCard',
      { card: 'red-9-1' },
      {
        reveals: [[jumper, 'red-9-1']],
      },
    );
    expect(good.rejected).toBeUndefined();
    expect((good.session.state as WildpileState).discard[0]).toBe('red-9-1');
  });

  it('leaves open rooms on the old, cheaper behaviour', () => {
    const open = createSession(wildpileGame, { seed: 91, config: jumpy, seats: 3 });
    expect((open.state as WildpileState).veiled).toBe(false);
  });

  it('draws from the fresh hidden order after a public discard is re-veiled', () => {
    const { session } = veiled();
    const retired = ['blue-2-0', 'green-3-0'];
    const base = wildpileGame.veil!.deck(defaults).cardIds.length;
    const issue = [`v#${base}`, `v#${base + 1}`];
    const spent = {
      ...session,
      state: {
        ...(session.state as WildpileState),
        stock: [],
        discard: [STARTER, ...retired],
      },
    };

    expect(sessionApply(wildpileGame, spent, 0, 'draw').rejected?.code).toBe('stock-not-reveiled');
    const outcome = sessionApply(wildpileGame, spent, 0, 'draw', undefined, {
      recycle: { retire: retired, issue },
    });
    const state = outcome.session.state as WildpileState;

    expect(outcome.rejected).toBeUndefined();
    expect(state.discard).toEqual([STARTER]);
    expect(state.stock).toEqual([issue[1]]);
    expect(state.hands[0]).toContain(issue[0]);
    expect(outcome.events[0]?.recycle).toEqual({ retire: retired, issue });
  });
});

describe('veiled replay', () => {
  it('reproduces the board and leaves unopened hands hidden', () => {
    const { deckOrder, session } = veiled();
    const handle = (session.state as WildpileState).hands[0]![0]!;
    const played = sessionApply(
      wildpileGame,
      session,
      0,
      'playCard',
      { card: 'red-9-0' },
      {
        reveals: [[handle, 'red-9-0']],
      },
    ).session;

    const replayed = replaySession(wildpileGame, 91, played.log, {
      config: defaults,
      seats: 2,
      veiled: true,
      deckOrder,
    });
    expect(stateHash(replayed.state)).toBe(stateHash(played.state));
    expect((replayed.state as WildpileState).hands[1]!.every((c) => c.startsWith('v#'))).toBe(true);
  });
});
