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
   * A veiled room opens the jump-in window to every seat, one after another, so
   * an active seat that followed the window's actor toured the whole table on
   * every card played — highlighting, ringing and chiming at each stop before
   * settling on the seat that had the turn all along.
   */
  it('lights no seat while a jump-in window is open', () => {
    const transport = new WildTransport({
      mode: 'party',
      seats: 3,
      seed: 91,
      player: { name: 'Host', avatarId: 'ember' },
    });
    const snapshot = transport.getSnapshot();
    const polled = {
      ...snapshot,
      session: {
        ...snapshot.session,
        phase: { ...snapshot.session.phase, phase: 'interrupt', actor: 2 },
        state: {
          ...snapshot.session.state,
          turn: 1,
          interrupt: { resumeTurn: 1, card: 'red-5-0', candidates: [2] },
        },
      },
    };
    expect(wildTableView(polled, [{ id: 'declineJump' }], 2).activeSeat).toBeNull();

    // Window closed: the seat it was holding for lights up, once.
    const settled = {
      ...polled,
      session: {
        ...polled.session,
        phase: { ...polled.session.phase, phase: 'play', actor: 1 },
        state: { ...polled.session.state, interrupt: null },
      },
    };
    expect(wildTableView(settled, [], 2).activeSeat).toBe(1);
  });

  /*
   * The challenge window is a three-way choice, so the view has to say what the
   * third way would cost. While a pickup is pending every playable card IS a
   * stackable one, so the stack set is just the seat's playable cards at that
   * moment — and what the pile grows by is a question about the card that would
   * answer it, now that a Draw Two can join a Draw Four.
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
            handAtPlay: [],
            called: false,
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
    expect(withStack.challenge?.stackAdds).toBe(4);
    expect(withStack.challenge?.stackAmount).toBe(8);

    // A Draw Two in the live colour answers the same pile for two, and the
    // prompt has to say two rather than a hard-coded four.
    const withTwo = wildTableView(
      challenged,
      [{ id: 'playCard', payload: { card: 'green-draw-two-0' } }],
      1,
    );
    expect(withTwo.challenge?.stackAdds).toBe(2);
    expect(withTwo.challenge?.stackAmount).toBe(6);

    // Most hands cannot answer. The set is empty, not undefined, so the screen
    // can drop the button without a second null check.
    const without = wildTableView(challenged, [{ id: 'draw' }], 1);
    expect(without.challenge?.stackCards).toEqual([]);
    expect(without.challenge?.stackAmount).toBe(4);
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
            handAtPlay: [],
            called: false,
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
