import { describe, expect, it } from 'vitest';
import { WildTransport } from '@/lib/solo/WildTransport';
import { wildTableView } from './view';

describe('wildTableView', () => {
  it('renders the joined peer hand and legal moves from its assigned seat', () => {
    const transport = new WildTransport({
      mode: 'party',
      seats: 2,
      seed: 91,
      player: { name: 'Host', avatarId: 'ember' },
    });
    const snapshot = transport.getSnapshot();
    const localSeat = 1;
    const legal =
      snapshot.session.phase.actor === localSeat
        ? snapshot.session.def.flow.legalMoves(snapshot.session.state, snapshot.session.phase)
        : [];

    const view = wildTableView(snapshot, legal, localSeat);

    expect(view.localSeat).toBe(1);
    expect(view.hand).toEqual(snapshot.session.state.hands[1]);
    expect(view.players.find((player) => player.seat === 1)?.isLocal).toBe(true);
    expect(view.players.find((player) => player.seat === 0)?.isLocal).toBe(false);
  });

  it('does not prompt a jump-in when the seat has nothing that matches', () => {
    const transport = new WildTransport({
      mode: 'party',
      seats: 2,
      seed: 91,
      player: { name: 'Host', avatarId: 'ember' },
    });
    const snapshot = transport.getSnapshot();
    const interrupted = {
      ...snapshot,
      session: {
        ...snapshot.session,
        phase: { ...snapshot.session.phase, phase: 'interrupt', actor: 0 },
      },
    };
    const view = wildTableView(interrupted, [{ id: 'declineJump' }], 0);
    expect(view.decision).toBeNull();
    expect(view.legal.playCards).toEqual([]);
  });

  it('prompts a jump-in only when the seat holds an exact match', () => {
    const transport = new WildTransport({
      mode: 'party',
      seats: 2,
      seed: 91,
      player: { name: 'Host', avatarId: 'ember' },
    });
    const snapshot = transport.getSnapshot();
    const interrupted = {
      ...snapshot,
      session: {
        ...snapshot.session,
        phase: { ...snapshot.session.phase, phase: 'interrupt', actor: 0 },
      },
    };
    const view = wildTableView(
      interrupted,
      [{ id: 'playCard', payload: { card: 'red-5-0' } }, { id: 'declineJump' }],
      0,
    );
    expect(view.decision).toBe('jump-in');
    expect(view.legal.playCards).toEqual(['red-5-0']);
  });

  /*
   * The challenge window is a three-way choice, so the view has to say what the
   * third way would cost. While a pickup is pending every playable card IS a
   * stackable one, so the stack set is just the seat's playable cards at that
   * moment — and the pile grows by four, not by the amount.
   */
  it('reports the stackable cards and the larger pile they would leave behind', () => {
    const transport = new WildTransport({
      mode: 'party',
      seats: 3,
      seed: 91,
      player: { name: 'Host', avatarId: 'ember' },
    });
    const snapshot = transport.getSnapshot();
    const challenged = {
      ...snapshot,
      session: {
        ...snapshot.session,
        // The window only opens for the seat on the clock: `offered` is empty
        // for anyone else, so without this the stack set would read empty too.
        phase: { ...snapshot.session.phase, actor: 1 },
        state: {
          ...snapshot.session.state,
          turn: 1,
          challenge: {
            accused: 0,
            challenger: 1,
            colorAtPlay: 'green' as const,
            heldMatches: [],
            amount: 4,
          },
        },
      },
    };

    const withStack = wildTableView(
      challenged,
      [{ id: 'playCard', payload: { card: 'wild-draw-four-1' } }],
      1,
    );
    expect(withStack.challenge?.stackCards).toEqual(['wild-draw-four-1']);
    expect(withStack.challenge?.stackAmount).toBe(8);

    // Most hands cannot answer. The set is empty, not undefined, so the screen
    // can drop the button without a second null check.
    const without = wildTableView(challenged, [{ id: 'draw' }], 1);
    expect(without.challenge?.stackCards).toEqual([]);
    expect(without.challenge?.stackAmount).toBe(8);
  });

  it('keeps the challenge window to the seat facing the pickup', () => {
    const transport = new WildTransport({
      mode: 'party',
      seats: 3,
      seed: 91,
      player: { name: 'Host', avatarId: 'ember' },
    });
    const snapshot = transport.getSnapshot();
    const challenged = {
      ...snapshot,
      session: {
        ...snapshot.session,
        state: {
          ...snapshot.session.state,
          challenge: {
            accused: 0,
            challenger: 1,
            colorAtPlay: 'green' as const,
            heldMatches: [],
            amount: 4,
          },
        },
      },
    };

    // Seat 2 is not the one being asked, so it gets no window at all.
    expect(wildTableView(challenged, [], 2).challenge).toBeNull();
    expect(wildTableView(challenged, [], 1).challenge).not.toBeNull();
  });
});
