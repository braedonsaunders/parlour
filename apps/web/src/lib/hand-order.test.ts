import { orderedHand } from '@parlour/engine';
import { blitzCatalog } from '@parlour/game-blitz';
import { cribbageCatalog } from '@parlour/game-cribbage';
import { euchreCatalog } from '@parlour/game-euchre';
import { ginCatalog } from '@parlour/game-gin';
import { heartsCatalog } from '@parlour/game-hearts';
import { presidentCatalog } from '@parlour/game-president';
import { ratscrewCatalog } from '@parlour/game-ratscrew';
import { wildpileCatalog } from '@parlour/game-wildpile';
import { describe, expect, it } from 'vitest';

describe('game-pack hand ordering', () => {
  it('puts the strongest Blitz suit first without mutating the engine hand', () => {
    const source = ['C2', 'H9', 'S1', 'H10'] as const;

    expect(orderedHand(source, blitzCatalog.handOrder)).toEqual(['H10', 'H9', 'S1', 'C2']);
    expect(source).toEqual(['C2', 'H9', 'S1', 'H10']);
  });

  it('matches the Wild mobile layout: wilds, then red, yellow, green, and blue', () => {
    const source = [
      'blue-9-0',
      'red-skip-0',
      'yellow-2-0',
      'wild-draw-four-1',
      'red-3-0',
      'wild-0',
    ];

    expect(orderedHand(source, wildpileCatalog.handOrder)).toEqual([
      'wild-0',
      'wild-draw-four-1',
      'red-3-0',
      'red-skip-0',
      'yellow-2-0',
      'blue-9-0',
    ]);
  });

  it('moves both bowers into an outermost trump block in Euchre', () => {
    expect(
      orderedHand(['H11', 'D11', 'H1', 'S9', 'D9'], euchreCatalog.handOrder, {
        trump: 'H',
      }),
    ).toEqual(['S9', 'D9', 'H1', 'D11', 'H11']);
  });

  it('keeps Gin melds contiguous and leaves deadwood rank-grouped', () => {
    expect(
      orderedHand(
        ['C13', 'S3', 'H7', 'S1', 'D7', 'S2', 'C5', 'C7', 'D12', 'H4'],
        ginCatalog.handOrder,
      ),
    ).toEqual(['S1', 'S2', 'S3', 'C7', 'D7', 'H7', 'H4', 'C5', 'D12', 'C13']);
  });

  it('groups Hearts follow-suit choices and exposes special scoring cards at block edges', () => {
    const source = ['H2', 'S1', 'S12', 'S13', 'D11', 'D13', 'C2'];

    expect(orderedHand(source, heartsCatalog.handOrder)).toEqual([
      'C2',
      'D11',
      'D13',
      'S13',
      'S1',
      'S12',
      'H2',
    ]);
    expect(orderedHand(source, heartsCatalog.handOrder, { jackDiamonds: true })).toEqual([
      'C2',
      'D13',
      'D11',
      'S13',
      'S1',
      'S12',
      'H2',
    ]);
  });

  it('uses rank-first Cribbage and President orders suited to their combinations', () => {
    expect(orderedHand(['S13', 'C2', 'H1', 'D2', 'S1'], cribbageCatalog.handOrder)).toEqual([
      'H1',
      'S1',
      'C2',
      'D2',
      'S13',
    ]);
    expect(orderedHand(['H2', 'C3', 'S1', 'D13', 'S3'], presidentCatalog.handOrder)).toEqual([
      'C3',
      'S3',
      'D13',
      'S1',
      'H2',
    ]);
  });

  it('leaves Rat Screw face-down piles untouched', () => {
    const pile = ['S3', 'C1', 'H9'];
    expect(orderedHand(pile, ratscrewCatalog.handOrder)).toEqual(pile);
  });
});
