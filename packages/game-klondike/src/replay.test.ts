import { describe, expect, it } from 'vitest';
import { replaySession, stateHash } from '@parlour/engine';
import { klondikeGame, legalMovesFor } from './game';
import { applyMove, openSession } from './test-util';

describe('Klondike replay', () => {
  it('reproduces the same state and hash from the seed and log', () => {
    let session = openSession(8_808);
    for (let step = 0; step < 160 && session.status === 'playing'; step++) {
      const legal = legalMovesFor(session.state);
      const productive = legal.filter((move) => move.id !== 'foundation.toTableau');
      const move = (productive.length > 0 ? productive : legal)[step % Math.max(1, legal.length)];
      if (!move) break;
      session = applyMove(session, move);
    }
    expect(session.log.length).toBeGreaterThan(0);
    const replayed = replaySession(klondikeGame, session.seed, session.log, {
      config: session.config,
      seats: 1,
    });
    expect(replayed.state).toEqual(session.state);
    expect(replayed.log).toEqual(session.log);
    expect(stateHash(replayed.state)).toBe(stateHash(session.state));
  });

  it('deals identical states for identical seeds and different states for adjacent seeds', () => {
    expect(openSession(123).state).toEqual(openSession(123).state);
    expect(openSession(123).state).not.toEqual(openSession(124).state);
  });
});
