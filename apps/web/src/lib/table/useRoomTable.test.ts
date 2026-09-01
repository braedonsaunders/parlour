import { describe, expect, it } from 'vitest';
import type { GameSession, RuleValues } from '@parlour/engine';
import { isStaleMoveFault, latestPlayerActionKey, withoutActingSeats } from './useRoomTable';

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

describe('the shared human handoff gate', () => {
  it('opens once per deliberate seat action, not for its automatic follow-ups', () => {
    const session = {
      seed: 42,
      log: [
        { seq: 0, seat: 0, move: 'playCard' },
        { seq: 1, seat: null, move: 'advance', automatic: true },
      ],
    } as unknown as GameSession<unknown, RuleValues>;

    expect(latestPlayerActionKey(session)).toBe('42:0:0');
  });

  it('keeps the destination board visible while withholding every acting seat', () => {
    const session = {
      phase: { phase: 'play', actor: 1, actors: [1, 2], round: 3 },
    } as unknown as GameSession<unknown, RuleValues>;

    const paced = withoutActingSeats(session);
    expect(paced.phase).toEqual({ phase: 'play', actor: null, actors: [], round: 3 });
    expect(session.phase.actor).toBe(1);
  });
});
