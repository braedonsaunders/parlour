import { describe, expect, it } from 'vitest';
import { sessionApply } from '@parlour/engine';
import { DECK } from './cards';
import { golfGame, legalMovesFor } from './game';
import { applyMove, openSession } from './test-util';

function cards(state: ReturnType<typeof openSession>['state']): string[] {
  return [...state.stock, ...state.waste, ...state.tableau.flat()];
}

describe('Golf seed and move fuzz', () => {
  it('conserves all 52 unique cards across 10,000 seeded deals', () => {
    const expected = new Set(DECK.cardIds);
    for (let seed = 0; seed < 10_000; seed++) {
      const dealt = cards(openSession(seed).state);
      expect(dealt).toHaveLength(52);
      expect(new Set(dealt)).toEqual(expected);
    }
  });

  it('makes every enumerated move apply and ends when nothing legal remains', () => {
    const expected = new Set(DECK.cardIds);
    for (let seed = 0; seed < 400; seed++) {
      let session = openSession(seed * 97 + 11, { wrap: seed % 2 === 0 });
      for (let step = 0; step < 80 && session.status === 'playing'; step++) {
        const legal = legalMovesFor(session.state);
        expect(legal.length, `${seed}/${step}`).toBeGreaterThan(0);
        for (const move of legal) {
          const outcome = sessionApply(golfGame, session, 0, move.id, move.payload);
          expect(outcome.rejected, `${seed}/${step}/${move.id}`).toBeUndefined();
        }
        session = applyMove(
          session,
          legal[(seed + step * 17) % legal.length] as (typeof legal)[number],
        );
        expect(new Set(cards(session.state))).toEqual(expected);
      }
      if (session.status === 'playing') {
        expect(legalMovesFor(session.state).length).toBeGreaterThan(0);
      } else {
        expect(legalMovesFor(session.state)).toEqual([]);
      }
    }
  });
});
