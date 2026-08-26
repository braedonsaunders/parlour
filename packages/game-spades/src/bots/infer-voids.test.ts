import { describe, expect, it } from 'vitest';
import { inferVoids } from './play';
import type { SpadesState } from '../state';
import { spadesConfig } from '../config';

/**
 * Void inference is the product claim: a seat that shows off-suit on a lead
 * can never hold that suit again this hand. The chosen play has to be made
 * more sensible by that knowledge, and it is measured at the H2H margin —
 * otherwise it is speculation with a suit name on it.
 */
function makeState(): SpadesState {
  return {
    rules: spadesConfig.resolve({ targetScore: 250, nil: true }) as never,
    veiled: false,
    overtime: false,
    scores: [0, 0],
    bags: [4, 0],
    handNo: 1,
    dealer: 0,
    plays: [
      { seat: 1, card: 'H5' },
      { seat: 2, card: 'C9' }, // partner declines hearts → void
      { seat: 0, card: 'H8' },
      { seat: 3, card: 'H10' },
    ],
    trickWinners: [3],
    tricksBySeat: [0, 0, 0, 1],
    hands: [['S1', 'S2', 'H13'], [], [], [], []],
    stage: 'playing',
    turn: 0,
    bids: [null, null, null, null] as never,
    leader: 3 as never,
    trick: null,
    tricksPlayed: 1,
    summary: null,
    lastHand: null,
    lastHandSummary: null,
  } as unknown as SpadesState;
}

describe('inferVoids', () => {
  it('reconstructs a provable void from a failed follow', () => {
    const state = makeState();
    const voids = inferVoids(state);
    expect(voids.voids[2]).toContain('hearts');
    expect(voids.voids[2]).not.toContain('spades');
    expect(voids.voids[1]).not.toContain('hearts');
  });

  it('leaves a suit unmarked when every follow-suit was honoured', () => {
    const state = makeState();
    const voids = inferVoids(state);
    for (const seat of [0, 1, 3]) {
      expect(voids.voids[seat]).not.toContain('hearts');
    }
  });
});
