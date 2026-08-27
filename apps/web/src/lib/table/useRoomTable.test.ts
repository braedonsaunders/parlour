import { describe, expect, it } from 'vitest';
import { isStaleMoveFault } from './useRoomTable';

/**
 * Reported from a real table: hosting on a Mac with a phone as the second
 * player and two bots, tapping "Last card!" produced
 *
 *   The table lost the thread.
 *   move callLastCard is not legal right now
 *
 * The engine was right to refuse it. Arming last-card protection is offered
 * only while a playable card would leave exactly one behind, and by the time
 * the tap arrived that had stopped being true. What was wrong was the
 * consequence: a mistimed tap on an optional, cost-free control replaced a
 * live game with an error screen, on a table where nothing had actually gone
 * wrong and every peer still agreed on the position.
 */
describe('a refused move is not a broken table', () => {
  it('recognises the engine refusing a move that no longer applies', () => {
    expect(isStaleMoveFault(new Error('move callLastCard is not legal right now'))).toBe(true);
    expect(isStaleMoveFault(new Error('move playCard is not legal right now'))).toBe(true);
  });

  it('recognises a move that already landed', () => {
    expect(isStaleMoveFault(new Error('duplicate action'))).toBe(true);
  });

  /*
   * The filter has to stay narrow. These are the failures where the table
   * really has stopped working for this player, and swallowing one would leave
   * them tapping at a game that silently stopped answering.
   */
  it('leaves a genuinely broken table alone', () => {
    expect(isStaleMoveFault(new Error('The move could not be sent.'))).toBe(false);
    expect(isStaleMoveFault(new Error('action seat does not belong to this profile'))).toBe(false);
    expect(isStaleMoveFault(new Error('transport is not ready'))).toBe(false);
    expect(isStaleMoveFault(new Error('the shuffle ceremony stalled'))).toBe(false);
  });
});
