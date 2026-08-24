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
});
