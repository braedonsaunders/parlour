import { describe, expect, it } from 'vitest';
import { sessionApply } from '@parlour/engine';
import { DECK } from './cards';
import { leftoverOf, legalMovesFor, pyramidGame } from './game';
import { applyMove, openSession } from './test-util';

function cards(state: ReturnType<typeof openSession>['state']): string[] {
  return [
    ...state.stock,
    ...state.waste,
    ...state.pyramid.flat().filter((card): card is string => card !== null),
  ];
}

describe('Pyramid seed and move fuzz', () => {
  it('conserves all 52 unique cards across 10,000 seeded deals', () => {
    const expected = new Set(DECK.cardIds);
    for (let seed = 0; seed < 10_000; seed++) {
      const dealt = cards(openSession(seed).state);
      expect(dealt).toHaveLength(52);
      expect(new Set(dealt)).toEqual(expected);
      expect(leftoverOf(openSession(seed).state)).toBe(52);
    }
  });

  it('makes every enumerated move apply and ends when nothing legal remains', () => {
    for (let seed = 0; seed < 400; seed++) {
      let session = openSession(seed * 97 + 11, { recyclesLimit: seed % 2 === 0 ? 2 : -1 });
      for (let step = 0; step < 80 && session.status === 'playing'; step++) {
        const legal = legalMovesFor(session.state);
        expect(legal.length, `${seed}/${step}`).toBeGreaterThan(0);
        for (const move of legal) {
          const outcome = sessionApply(pyramidGame, session, 0, move.id, move.payload);
          expect(outcome.rejected, `${seed}/${step}/${move.id}`).toBeUndefined();
        }
        session = applyMove(
          session,
          legal[(seed + step * 17) % legal.length] as (typeof legal)[number],
        );
        const remaining = cards(session.state);
        expect(new Set(remaining).size).toBe(remaining.length);
        expect(leftoverOf(session.state)).toBe(remaining.length);
      }
      if (session.status === 'playing') {
        expect(legalMovesFor(session.state).length).toBeGreaterThan(0);
      } else {
        expect(legalMovesFor(session.state)).toEqual([]);
      }
    }
  });
});
