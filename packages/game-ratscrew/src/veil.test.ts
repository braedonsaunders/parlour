import { describe, expect, it } from 'vitest';
import { createSession, replaySession, sessionApply, stateHash, veiledDeckOrder } from '@parlour/engine';
import { ratscrewConfigSchema } from './config';
import { ratscrewGame, type RatscrewState } from './game';

function veiled(seats = 2) {
  const deckOrder = veiledDeckOrder(ratscrewGame.veil!, seats, []);
  return {
    deckOrder,
    session: createSession(ratscrewGame, {
      seed: 11,
      config: ratscrewConfigSchema.resolve({}),
      seats,
      veiled: true,
      deckOrder,
    }),
  };
}

describe('rat screw under Veil', () => {
  it('deals every pile face down as opaque handles', () => {
    const { session } = veiled();
    const state = session.state as RatscrewState;
    expect(state.veiled).toBe(true);
    expect(state.piles.flat()).toHaveLength(52);
    expect(state.piles.flat().every((card) => card.startsWith('v#'))).toBe(true);
  });

  it('needs no public opening before setup — nothing is face up at the deal', () => {
    expect(ratscrewGame.veil!.publicSetupReady([], 2, {})).toBe(true);
    expect(ratscrewGame.veil!.publicSetupFrom(2, {})).toBe(52);
  });

  it('refuses a flip that arrives without the opening for the top card', () => {
    const { session } = veiled();
    const outcome = sessionApply(ratscrewGame, session, 0, 'flip');
    expect(outcome.rejected?.code).toBe('card-still-veiled');
  });

  it('flips face up when the opening rides along, and scores on the real card', () => {
    const { session } = veiled();
    const top = (session.state as RatscrewState).piles[0]![0]!;
    const outcome = sessionApply(ratscrewGame, session, 0, 'flip', undefined, {
      reveals: [[top, 'S11']],
    });
    expect(outcome.rejected).toBeUndefined();
    const state = outcome.session.state as RatscrewState;
    expect(state.center).toEqual(['S11']);
    // A jack is a face card: the next seat owes one chance.
    expect(state.challenge).toEqual({ challenger: 0, target: 1, chancesLeft: 1 });
    expect(state.piles[0]!.every((card) => card.startsWith('v#'))).toBe(true);
  });

  it('rejects a flip that tries to open the top card as a card already in the center', () => {
    const { session } = veiled();
    const state0 = session.state as RatscrewState;
    const first = sessionApply(ratscrewGame, session, 0, 'flip', undefined, {
      reveals: [[state0.piles[0]![0]!, 'S5']],
    }).session;
    const next = first.state as RatscrewState;
    const outcome = sessionApply(ratscrewGame, first, 1, 'flip', undefined, {
      reveals: [[next.piles[1]![0]!, 'S5']],
    });
    expect(outcome.rejected?.code).toBe('card-already-open');
  });

  it('replays a veiled hand to the same board, leaving unflipped piles hidden', () => {
    const { deckOrder, session } = veiled();
    let current = session;
    const faces = ['S5', 'H5', 'C9'];
    for (const face of faces) {
      const state = current.state as RatscrewState;
      const seat = state.turn;
      const outcome = sessionApply(ratscrewGame, current, seat, 'flip', undefined, {
        reveals: [[state.piles[seat]![0]!, face]],
      });
      if (outcome.rejected) break;
      current = outcome.session;
    }

    const replayed = replaySession(ratscrewGame, 11, current.log, {
      config: ratscrewConfigSchema.resolve({}),
      seats: 2,
      veiled: true,
      deckOrder,
    });
    expect(stateHash(replayed.state)).toBe(stateHash(current.state));
    const state = replayed.state as RatscrewState;
    expect(state.piles.flat().every((card) => card.startsWith('v#'))).toBe(true);
  });
});
