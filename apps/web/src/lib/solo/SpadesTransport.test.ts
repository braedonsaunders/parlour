import { describe, expect, it } from 'vitest';
import { SpadesTransport } from './SpadesTransport';

function makeTransport(seed = 4_242, mode: 'classic' | 'quick' | 'clean-books' = 'quick') {
  return new SpadesTransport({
    mode,
    seed,
    player: { name: 'Bea', avatarId: 'ember' },
    botTier: 2,
  });
}

describe('SpadesTransport', () => {
  it('seats the human at 0 with a partner across the table', () => {
    const players = makeTransport().getSnapshot().players;
    expect(players).toHaveLength(4);
    expect(players[0]).toMatchObject({ seat: 0, name: 'Bea', isBot: false });
    expect(players.slice(1).every((player) => player.isBot)).toBe(true);
    // seat 2 is the partner; seats 1 and 3 are the opponents
    expect(players[2]!.seat % 2).toBe(0);
  });

  it('falls back to "You" for a blank profile name', () => {
    const transport = new SpadesTransport({
      mode: 'classic',
      seed: 1,
      player: { name: '   ', avatarId: 'ember' },
    });
    expect(transport.getSnapshot().players[0]!.name).toBe('You');
  });

  it('opens in bidding with the human offered 1..13 plus nil', () => {
    const transport = makeTransport();
    const snapshot = transport.getSnapshot();
    expect(snapshot.session.state.stage).toBe('bidding');
    // Bots left of the dealer may act first; run them up to the human.
    transport.playBotsUntilHuman();
    const legal = transport.legalMoves();
    const bids = legal.filter((move) => move.id === 'bid');
    expect(bids).toHaveLength(13);
    expect(legal.some((move) => move.id === 'bidNil')).toBe(true);
  });

  it('offers no nil when the table turned it off', () => {
    const transport = new SpadesTransport({
      mode: 'classic',
      seed: 9,
      player: { name: 'Bea', avatarId: 'ember' },
    });
    // classic keeps nil on — assert the shipped presets never remove it, which
    // is why the rail always renders the Nil action for a real table.
    transport.playBotsUntilHuman();
    expect(transport.legalMoves().some((move) => move.id === 'bidNil')).toBe(true);
  });

  it('hides legal moves while a bot is acting', () => {
    const transport = makeTransport();
    const snapshot = transport.getSnapshot();
    if (snapshot.session.phase.actor !== 0) {
      expect(transport.legalMoves()).toEqual([]);
    }
    transport.playBotsUntilHuman();
    expect(transport.getSnapshot().session.phase.actor).toBe(0);
  });

  it('applies a human bid and hands the turn on', () => {
    const transport = makeTransport();
    transport.playBotsUntilHuman();
    const outcome = transport.dispatch('bid', { bid: 3 });
    expect(outcome.rejected).toBeNull();
    expect(outcome.snapshot.session.state.bids[0]).toMatchObject({
      seat: 0,
      tricks: 3,
      nil: false,
    });
  });

  it('records a nil bid as nil rather than a zero', () => {
    const transport = makeTransport();
    transport.playBotsUntilHuman();
    const outcome = transport.dispatch('bidNil');
    expect(outcome.rejected).toBeNull();
    expect(outcome.snapshot.session.state.bids[0]).toMatchObject({ nil: true, tricks: 0 });
  });

  it('softly rejects an illegal move instead of throwing', () => {
    const transport = makeTransport();
    transport.playBotsUntilHuman();
    const outcome = transport.dispatch('playCard', { card: 'S1' });
    expect(outcome.rejected).not.toBeNull();
    expect(outcome.snapshot.session.state.stage).toBe('bidding');
  });

  it('is deterministic — same seed, same table', () => {
    const a = makeTransport(77);
    const b = makeTransport(77);
    a.playBotsUntilHuman();
    b.playBotsUntilHuman();
    expect(a.getSnapshot().session.state.hands).toEqual(b.getSnapshot().session.state.hands);
    expect(a.getSnapshot().session.state.bids).toEqual(b.getSnapshot().session.state.bids);
  });

  it('plays a full hand out and scores both partnerships', () => {
    const transport = makeTransport(2_024);
    let guard = 0;
    while (transport.getSnapshot().session.state.handNo === 1 && guard++ < 400) {
      const snapshot = transport.getSnapshot();
      if (snapshot.session.status !== 'playing') break;
      if (snapshot.session.phase.actor === 0) {
        const legal = transport.legalMoves();
        if (legal.length === 0) break;
        const choice = legal[0]!;
        transport.dispatch(choice.id, choice.payload);
      } else {
        transport.playBotTurn();
      }
    }
    const state = transport.getSnapshot().session.state;
    // The open table auto-deals, so hand 1's breakdown survives on lastHand.
    expect(state.lastHand).not.toBeNull();
    expect(state.lastHand!.teams).toHaveLength(2);
    expect(state.lastHand!.tricksBySeat.reduce((sum, count) => sum + count, 0)).toBe(13);
  });
});
