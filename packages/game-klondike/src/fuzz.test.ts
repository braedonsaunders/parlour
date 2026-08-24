import { describe, expect, it } from 'vitest';
import { sessionApply } from '@parlour/engine';
import { DECK, SUITS } from './cards';
import { klondikeGame, legalMovesFor } from './game';
import { applyMove, openSession } from './test-util';

function cards(state: ReturnType<typeof openSession>['state']): string[] {
  return [
    ...state.stock,
    ...state.waste,
    ...state.tableau.flatMap((column) => [...column.down, ...column.up]),
    ...SUITS.flatMap((suit) => state.foundations[suit]),
  ];
}

describe('Klondike seed and move fuzz', () => {
  it('conserves all 52 unique cards across 10,000 seeded deals', () => {
    const expected = new Set(DECK.cardIds);
    for (let seed = 0; seed < 10_000; seed++) {
      const dealt = cards(openSession(seed).state);
      expect(dealt).toHaveLength(52);
      expect(new Set(dealt)).toEqual(expected);
    }
  });

  it('makes every enumerated move apply and conserves the deck through long bounded traces', () => {
    const expected = new Set(DECK.cardIds);
    for (let seed = 0; seed < 200; seed++) {
      let session = openSession(seed * 97 + 11, { drawCount: seed % 2 === 0 ? 1 : 3 });
      for (let step = 0; step < 180 && session.status === 'playing'; step++) {
        const legal = legalMovesFor(session.state);
        expect(legal.length).toBeGreaterThan(0);
        for (const move of legal) {
          const outcome = sessionApply(klondikeGame, session, 0, move.id, move.payload);
          expect(outcome.rejected, `${seed}/${step}/${move.id}`).toBeUndefined();
        }
        session = applyMove(
          session,
          legal[(seed + step * 17) % legal.length] as (typeof legal)[number],
        );
        const held = cards(session.state);
        expect(held).toHaveLength(52);
        expect(new Set(held)).toEqual(expected);
      }
    }
  });
});
