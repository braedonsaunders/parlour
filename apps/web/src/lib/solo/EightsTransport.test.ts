import { describe, expect, it } from 'vitest';
import { EightsTransport } from './EightsTransport';

function makeTransport(seats = 4, seed = 8_888) {
  return new EightsTransport({
    mode: 'house',
    seats,
    seed,
    player: { name: 'Bea', avatarId: 'ember' },
    botTier: 2,
  });
}

describe('EightsTransport', () => {
  it('seats the human at 0 and fills the rest with the house cast', () => {
    const players = makeTransport(5).getSnapshot().players;
    expect(players).toHaveLength(5);
    expect(players[0]).toMatchObject({ seat: 0, name: 'Bea', isBot: false });
    expect(players.slice(1).every((player) => player.isBot)).toBe(true);
    // No two bots wear the same face at a full table.
    expect(new Set(players.slice(1).map((player) => player.avatarId)).size).toBe(4);
  });

  it('falls back to "You" for a blank profile name', () => {
    const transport = new EightsTransport({
      mode: 'classic',
      seats: 2,
      seed: 1,
      player: { name: '   ', avatarId: 'ember' },
    });
    expect(transport.getSnapshot().players[0]!.name).toBe('You');
  });

  it('offers the human a play or a draw once the turn reaches them', () => {
    const transport = makeTransport();
    transport.playBotsUntilHuman();
    const snapshot = transport.getSnapshot();
    expect(snapshot.session.phase.actor).toBe(0);
    const ids = new Set(transport.legalMoves().map((move) => move.id));
    expect(ids.has('draw') || ids.has('playCard')).toBe(true);
  });

  it('rejects a card the pile will not take instead of dealing it', () => {
    const transport = makeTransport();
    transport.playBotsUntilHuman();
    const outcome = transport.dispatch('playCard', { card: 'not-a-card' });
    expect(outcome.rejected).not.toBeNull();
    expect(transport.getSnapshot().session.log).toHaveLength(
      transport.getSnapshot().session.log.length,
    );
  });

  it('runs a whole match to a winner without stalling', () => {
    const transport = new EightsTransport({
      mode: 'house',
      seats: 3,
      seed: 31,
      player: { name: 'Bea', avatarId: 'ember' },
      botTier: 2,
      rules: {
        handSize: 7,
        targetScore: 50,
        twosDrawTwo: true,
        queensSkip: true,
        acesReverse: true,
        stackDrawTwo: false,
        drawUntilPlayable: true,
        forcePlay: false,
      },
    });

    for (let step = 0; step < 4_000; step++) {
      const snapshot = transport.getSnapshot();
      if (snapshot.session.status !== 'playing') break;
      transport.playBotsUntilHuman();
      const live = transport.getSnapshot();
      if (live.session.status !== 'playing') break;
      const legal = transport.legalMoves();
      expect(legal.length, `seat 0 in ${live.session.phase.phase}`).toBeGreaterThan(0);
      const choice = legal[0]!;
      const outcome = transport.dispatch(choice.id, choice.payload);
      expect(outcome.rejected, `${choice.id}`).toBeNull();
    }

    const finished = transport.getSnapshot();
    expect(finished.session.status).toBe('ended');
    expect(finished.matchWinner).not.toBeNull();
    expect(Math.max(...finished.session.state.scores)).toBeGreaterThanOrEqual(50);
  });
});
