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
});
