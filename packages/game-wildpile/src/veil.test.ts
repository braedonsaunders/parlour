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
    const outcome = sessionApply(wildpileGame, session, 0, 'playCard', { card: 'red-9-0' }, {
      reveals: [[handle, 'red-9-0']],
    });
    expect(outcome.rejected).toBeUndefined();
    const state = outcome.session.state as WildpileState;
    expect(state.discard[0]).toBe('red-9-0');
    expect(state.activeColor).toBe('red');
    expect(state.hands[0]!.every((card) => card.startsWith('v#'))).toBe(true);
    expect(state.hands[1]!.every((card) => card.startsWith('v#'))).toBe(true);
  });

  it('refuses a play whose opened card does not match the pile', () => {
    const { session } = veiled();
    const handle = (session.state as WildpileState).hands[0]![0]!;
    const outcome = sessionApply(wildpileGame, session, 0, 'playCard', { card: 'blue-9-0' }, {
      reveals: [[handle, 'blue-9-0']],
    });
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

describe('veiled jump-in', () => {
  const jumpy = wildpileConfig.resolve({ jumpIn: true, sevenZero: false, swapCards: false });

  it('opens the window to every seat, because the table cannot see who matches', () => {
    const { session } = veiled(3, jumpy);
    const handle = (session.state as WildpileState).hands[0]![0]!;
    const played = sessionApply(wildpileGame, session, 0, 'playCard', { card: 'red-9-0' }, {
      reveals: [[handle, 'red-9-0']],
    }).session;
    const state = played.state as WildpileState;
    expect(state.interrupt?.card).toBe('red-9-0');
    expect(state.interrupt?.candidates).toEqual([1, 2]);
  });

  it('lets a seat with nothing decline, handing the turn on', () => {
    const { session } = veiled(3, jumpy);
    const handle = (session.state as WildpileState).hands[0]![0]!;
    let current = sessionApply(wildpileGame, session, 0, 'playCard', { card: 'red-9-0' }, {
      reveals: [[handle, 'red-9-0']],
    }).session;
    current = sessionApply(wildpileGame, current, 1, 'declineJump').session;
    current = sessionApply(wildpileGame, current, 2, 'declineJump').session;
    const state = current.state as WildpileState;
    expect(state.interrupt).toBeNull();
    expect(state.turn).toBe(1);
  });

  it('only accepts a jump whose opened card is an exact match', () => {
    const { session } = veiled(3, jumpy);
    const handle = (session.state as WildpileState).hands[0]![0]!;
    const played = sessionApply(wildpileGame, session, 0, 'playCard', { card: 'red-9-0' }, {
      reveals: [[handle, 'red-9-0']],
    }).session;
    const jumper = (played.state as WildpileState).hands[1]![0]!;
    expect(
      sessionApply(wildpileGame, played, 1, 'playCard', { card: 'blue-9-0' }, {
        reveals: [[jumper, 'blue-9-0']],
      }).rejected?.code,
    ).toBe('illegal-move');
    const good = sessionApply(wildpileGame, played, 1, 'playCard', { card: 'red-9-1' }, {
      reveals: [[jumper, 'red-9-1']],
    });
    expect(good.rejected).toBeUndefined();
    expect((good.session.state as WildpileState).discard[0]).toBe('red-9-1');
  });

  it('leaves open rooms on the old, cheaper behaviour', () => {
    const open = createSession(wildpileGame, { seed: 91, config: jumpy, seats: 3 });
    expect((open.state as WildpileState).veiled).toBe(false);
  });
});

describe('veiled replay', () => {
  it('reproduces the board and leaves unopened hands hidden', () => {
    const { deckOrder, session } = veiled();
    const handle = (session.state as WildpileState).hands[0]![0]!;
    const played = sessionApply(wildpileGame, session, 0, 'playCard', { card: 'red-9-0' }, {
      reveals: [[handle, 'red-9-0']],
    }).session;

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
