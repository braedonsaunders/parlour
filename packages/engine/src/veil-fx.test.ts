import { describe, expect, it } from 'vitest';
import type { CardId } from './types';
import { resolveVeiledFx, resolveVeiledState } from './veil';

/*
 * Reported from a real table: cards sometimes do not travel, they appear at
 * their destination — most often on a discard, and seen by BOTH peers at the
 * same moment. That last detail is what rules out a dropped frame or a slow
 * phone: the payload was wrong for everybody rather than late for one.
 *
 * The cause is a disagreement about a card's name. `resolveVeiledState` puts
 * the real face on the table, so the card element in the DOM is keyed by its
 * resolved id — while the fx timeline that narrates the move still names the
 * handle it was dealt as. The animation driver looks the cue up by id, finds
 * nothing, and plans no flight.
 */
describe('a flight names the same card the table does', () => {
  const known = new Map<CardId, CardId>([
    ['v#3', 'red-7-0'],
    ['v#4', 'blue-2-1'],
  ]);

  it('resolves the card a discard flies with', () => {
    const fx = [{ type: 'card.discard', card: 'v#3' as CardId, seat: 0, to: 'discard' }];

    expect(resolveVeiledFx(fx, known)).toEqual([
      { type: 'card.discard', card: 'red-7-0', seat: 0, to: 'discard' },
    ]);
  });

  it('agrees with the state resolution, which is the whole point', () => {
    const state = { hands: [['v#3', 'v#4'] as CardId[]] };
    const fx = [{ type: 'card.discard', card: 'v#3' as CardId, from: 'hand:0', to: 'discard' }];

    const table = resolveVeiledState(state, known);
    const flight = resolveVeiledFx(fx, known);

    expect(table.hands[0]).toContain('red-7-0');
    expect(flight[0]!.card).toBe('red-7-0');
  });

  /*
   * The reason this cannot reuse `resolveVeiledState`: that one only substitutes
   * handles still present on the table, and a card that has just been played has
   * already left the hand it flew out of. That flight is precisely the one worth
   * drawing, so it must not be the one skipped.
   */
  it('resolves a card that has already left the table', () => {
    const fx = [{ type: 'card.discard', card: 'v#3' as CardId, to: 'discard' }];
    const stateWithoutIt = { hands: [['v#4'] as CardId[]] };

    expect(resolveVeiledState(stateWithoutIt, known)).toEqual({ hands: [['blue-2-1']] });
    expect(resolveVeiledFx(fx, known)[0]!.card).toBe('red-7-0');
  });

  it('leaves a handle nobody can read alone', () => {
    const fx = [{ type: 'card.deal', card: 'v#9' as CardId, to: 'hand:1' }];

    expect(resolveVeiledFx(fx, known)[0]!.card).toBe('v#9');
  });

  it('is a no-op for an open room, where nothing was ever hidden', () => {
    const fx = [{ type: 'card.discard', card: 'red-7-0' as CardId }];

    expect(resolveVeiledFx(fx, new Map())).toBe(fx);
  });
});
