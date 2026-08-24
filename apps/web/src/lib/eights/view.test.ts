import { describe, expect, it } from 'vitest';
import { EightsTransport } from '@/lib/solo/EightsTransport';
import { eightsAnnouncements, eightsTableView } from './view';

function table(seats = 3, seed = 5150) {
  return new EightsTransport({
    mode: 'house',
    seats,
    seed,
    player: { name: 'Host', avatarId: 'ember' },
    botTier: 2,
  });
}

describe('eightsTableView', () => {
  it('shows the local seat its own hand, and only counts for everyone else', () => {
    const transport = table();
    const snapshot = transport.getSnapshot();
    const view = eightsTableView(snapshot, transport.legalMoves(), 0);

    expect(view.localSeat).toBe(0);
    expect(view.hand).toEqual(snapshot.session.state.round.hands[0]);
    expect(view.players.filter((player) => player.isLocal)).toHaveLength(1);
    expect(view.players.map((player) => player.handCount)).toEqual([7, 7, 7]);
    expect(view.roundNumber).toBe(1);
    expect(view.targetScore).toBe(100);
  });

  it('renders a joined peer from its own assigned seat', () => {
    const transport = table(2, 77);
    const snapshot = transport.getSnapshot();
    const localSeat = 1;
    const legal =
      snapshot.session.phase.actor === localSeat
        ? snapshot.session.def.flow.legalMovesFor!(
            snapshot.session.state,
            snapshot.session.phase,
            localSeat,
          )
        : [];

    const view = eightsTableView(snapshot, legal, localSeat);

    expect(view.hand).toEqual(snapshot.session.state.round.hands[1]);
    expect(view.players.find((player) => player.seat === 1)?.isLocal).toBe(true);
    expect(view.players.find((player) => player.seat === 0)?.isLocal).toBe(false);
  });

  it('states the suit the pile is asking for, which an eight can change', () => {
    const transport = table();
    const snapshot = transport.getSnapshot();
    const view = eightsTableView(snapshot, [], 0);
    expect(view.activeSuit).toBe(snapshot.session.state.round.activeSuit);
    expect(view.discard[0]).toBe(snapshot.session.state.round.discard[0]);
  });

  it('names the local seat "You" on the scoresheet, and prices every hand', () => {
    const transport = table(3, 606);
    for (let step = 0; step < 2_000; step++) {
      const live = transport.getSnapshot();
      if (live.session.status !== 'playing' || live.session.state.folded) break;
      transport.playBotsUntilHuman();
      const now = transport.getSnapshot();
      if (now.session.status !== 'playing' || now.session.state.folded) break;
      const legal = transport.legalMoves();
      if (legal.length === 0) break;
      transport.dispatch(legal[0]!.id, legal[0]!.payload);
    }

    const snapshot = transport.getSnapshot();
    expect(snapshot.session.state.folded).toBe(true);
    const end = eightsTableView(snapshot, transport.legalMoves(), 0).roundEnd!;
    expect(end).not.toBeNull();
    expect(end.handValues).toHaveLength(3);
    expect(end.handCounts).toHaveLength(3);
    // Whoever won, the local seat is addressed in the second person.
    expect(end.winner === 0 ? end.winnerName : 'other').toBe(end.winner === 0 ? 'You' : 'other');
    expect(end.points).toBeGreaterThanOrEqual(0);
  });

  it('offers nothing while another seat is acting', () => {
    const transport = table();
    const snapshot = transport.getSnapshot();
    const view = eightsTableView(snapshot, [{ id: 'draw' }], 2);
    // Seat 2 is not on the clock at the deal, so the rail must stay closed.
    expect(view.decision).toBeNull();
    expect(view.legal.draw).toBe(false);
    expect(view.legal.playCards).toEqual([]);
  });
});

describe('eightsAnnouncements', () => {
  const players = [
    {
      seat: 0,
      name: 'You',
      avatarId: 'ember',
      handCount: 5,
      isLocal: true,
      isBot: false,
      score: 0,
      roundsWon: 0,
      dealer: true,
    },
    {
      seat: 1,
      name: 'Juniper',
      avatarId: 'juniper',
      handCount: 4,
      isLocal: false,
      isBot: true,
      score: 0,
      roundsWon: 0,
      dealer: false,
    },
  ];

  it('reads every effect that changes who plays next', () => {
    const calls = eightsAnnouncements(
      [
        { kind: 'eights.suit', payload: { seat: 0, suit: 'H' }, at: 0 },
        { kind: 'eights.skip', payload: { seat: 1 }, at: 10 },
        { kind: 'eights.reverse', payload: { seat: 0, direction: -1 }, at: 20 },
        { kind: 'eights.draw-stack', payload: { seat: 0, amount: 4 }, at: 30 },
      ],
      players,
    );

    expect(calls.map((call) => call.kind)).toEqual(['reverse', 'skip', 'draw-stack', 'suit']);
    expect(calls.find((call) => call.kind === 'skip')?.detail).toBe('Juniper loses a turn');
    expect(calls.find((call) => call.kind === 'suit')?.text).toBe('♥');
    expect(calls.find((call) => call.kind === 'draw-stack')?.text).toBe('+4');
  });

  it('ignores effects it does not narrate', () => {
    expect(eightsAnnouncements([{ kind: 'card.draw', payload: {}, at: 0 }], players)).toEqual([]);
  });
});
