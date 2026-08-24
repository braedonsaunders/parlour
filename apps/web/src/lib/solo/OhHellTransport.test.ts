import { describe, expect, it } from 'vitest';
import { OhHellTransport } from './OhHellTransport';

/**
 * The solo transport is the only thing standing between the pack and the table,
 * so these drive it the way the table does: ask for the human's legal moves,
 * play one, let the bots run, open the next round, and keep going until the
 * match ends. If the arc or the dealer rotation is wrong, a full playthrough is
 * where it shows.
 */
function open(seats = 4, mode: 'classic' | 'quick' | 'wizard' = 'quick') {
  return new OhHellTransport({
    mode,
    seats,
    seed: 20260824,
    player: { name: 'You', avatarId: 'ember' },
    botTier: 2,
  });
}

/** Plays a whole match, always taking the first move offered to seat 0. */
function playOut(transport: OhHellTransport, guard = 4_000) {
  const handSizes: number[] = [];
  const dealers: number[] = [];
  for (let step = 0; step < guard; step++) {
    const snapshot = transport.getSnapshot();
    if (snapshot.status === 'ended') return { snapshot, handSizes, dealers };
    if (snapshot.status === 'round-over') {
      transport.startNextRound();
      continue;
    }
    const round = snapshot.hand.state;
    if (handSizes[snapshot.round - 1] === undefined) {
      handSizes[snapshot.round - 1] = round.handSize;
      dealers[snapshot.round - 1] = round.dealer;
    }
    const legal = transport.legalMovesForSeat(0);
    if (legal.length > 0) transport.dispatch(legal[0]!.id, legal[0]!.payload);
    else transport.playBotsUntilHuman();
  }
  throw new Error('match did not end inside the step guard');
}

describe('OhHellTransport', () => {
  it('seats the human at 0 and fills the rest with named personas', () => {
    for (const seats of [3, 4, 5, 6, 7]) {
      const players = open(seats).getSnapshot().players;
      expect(players).toHaveLength(seats);
      expect(players[0]).toMatchObject({ seat: 0, name: 'You', isBot: false });
      for (const bot of players.slice(1)) {
        expect(bot.isBot).toBe(true);
        expect(bot.name.length).toBeGreaterThan(0);
        expect(bot.personaId).toBeTruthy();
      }
    }
  });

  it('plays a whole match to a ranked result at every seat count', () => {
    for (const seats of [3, 4, 5, 6, 7]) {
      const transport = open(seats);
      const { snapshot } = playOut(transport);
      expect(snapshot.status).toBe('ended');
      expect(snapshot.matchResult).not.toBeNull();
      expect(snapshot.matchResult!.rankings).toHaveLength(seats);
      expect(snapshot.scores).toHaveLength(seats);
    }
  });

  it('walks the hand-size arc and rotates the dealer every round', () => {
    const transport = open(4, 'quick');
    const rounds = transport.getSnapshot().rounds;
    const { handSizes, dealers } = playOut(transport);

    expect(handSizes).toHaveLength(rounds);
    // Quick is the down-only arc: five straight down to one.
    expect(handSizes).toEqual([5, 4, 3, 2, 1]);
    // Every round is dealt by the next seat round the table, which is the
    // whole reason this game is a MatchDef rather than a flat session.
    expect(dealers).toEqual(dealers.map((_, index) => index % 4));
  });

  it('refuses to open the next round while one is still being played', () => {
    const transport = open();
    expect(transport.startNextRound().rejected?.code).toBe('round-playing');
  });

  it('offers the human nothing while it is not their turn', () => {
    const transport = open();
    // Run the bots forward; whenever seat 0 is not the actor the list is empty,
    // which is what stops the table offering a move it would then reject.
    for (let step = 0; step < 200; step++) {
      const snapshot = transport.getSnapshot();
      if (snapshot.status !== 'playing') break;
      const actor = snapshot.hand.phase.actor;
      if (actor === 0) {
        expect(transport.legalMovesForSeat(0).length).toBeGreaterThan(0);
        const legal = transport.legalMovesForSeat(0);
        transport.dispatch(legal[0]!.id, legal[0]!.payload);
      } else {
        expect(transport.legalMovesForSeat(0)).toEqual([]);
        transport.playBotTurn();
      }
    }
  });

  it('is deterministic for a seed', () => {
    const a = playOut(open()).snapshot;
    const b = playOut(open()).snapshot;
    expect(a.scores).toEqual(b.scores);
    expect(a.matchResult).toEqual(b.matchResult);
  });
});
