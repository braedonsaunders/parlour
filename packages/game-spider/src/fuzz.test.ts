import { describe, expect, it } from 'vitest';
import { sessionApply } from '@parlour/engine';
import { deckFor, type SpiderSuitCount } from './cards';
import { legalMovesFor, spiderGame } from './game';
import { applyMove, openSession } from './test-util';

function cards(state: ReturnType<typeof openSession>['state']): string[] {
  return [
    ...state.stock,
    ...state.tableau.flatMap((column) => [...column.down, ...column.up]),
    ...state.foundations.flat(),
  ];
}

describe('Spider seed and move fuzz', () => {
  it('conserves all 104 unique cards across 10,000 seeded deals', () => {
    const expected = new Set(deckFor(2).cardIds);
    for (let seed = 0; seed < 10_000; seed++) {
      const dealt = cards(openSession(seed).state);
      expect(dealt).toHaveLength(104);
      expect(new Set(dealt)).toEqual(expected);
    }
  });

  it('makes every enumerated move apply and conserves the deck through long bounded traces', () => {
    const counts: SpiderSuitCount[] = [1, 2, 4];
    for (let seed = 0; seed < 80; seed++) {
      const suitCount = counts[seed % counts.length] as SpiderSuitCount;
      const expected = new Set(deckFor(suitCount).cardIds);
      let session = openSession(seed * 97 + 11, { suitCount });
      for (let step = 0; step < 120 && session.status === 'playing'; step++) {
        const legal = legalMovesFor(session.state);
        if (legal.length === 0) break;
        for (const move of legal) {
          const outcome = sessionApply(spiderGame, session, 0, move.id, move.payload);
          expect(outcome.rejected, `${seed}/${step}/${move.id}`).toBeUndefined();
        }
        session = applyMove(
          session,
          legal[(seed + step * 17) % legal.length] as (typeof legal)[number],
        );
        const held = cards(session.state);
        expect(held).toHaveLength(104);
        expect(new Set(held)).toEqual(expected);
      }
    }
  }, 60_000);
});
