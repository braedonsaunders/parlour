import { Fx } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { soundCuesForFx } from './sfx';

describe('fx-driven table audio', () => {
  it('sounds every dealt card and gives a discard a spatial flight then landing', () => {
    expect(
      soundCuesForFx(
        [
          { kind: Fx.DealCard, payload: {}, at: 0 },
          { kind: Fx.DealCard, payload: {}, at: 80 },
          { kind: Fx.DiscardCard, payload: {}, at: 200 },
        ],
        'blitz',
      ),
    ).toEqual([
      { id: 'parlour.deal.card', atMs: 0, rate: 0.97 },
      { id: 'parlour.deal.card', atMs: 80, rate: 1.02 },
      { id: 'parlour.card.discard.flight', atMs: 200 },
      { id: 'parlour.card.land', atMs: 380, rate: 0.99 },
    ]);
  });

  it('distinguishes stock and discard pickups from flips and shuffles', () => {
    expect(
      soundCuesForFx(
        [
          { kind: Fx.DrawCard, payload: { from: 'stock' }, at: 0 },
          { kind: Fx.DrawCard, payload: { from: 'discard' }, at: 100 },
          { kind: Fx.FlipCard, payload: {}, at: 200 },
          { kind: Fx.ShuffleStock, payload: {}, at: 300 },
          { kind: Fx.TurnRing, payload: {}, at: 400 },
        ],
        'blitz',
      ),
    ).toEqual([
      { id: 'parlour.card.draw.stock', atMs: 0, rate: 0.97 },
      { id: 'parlour.card.draw.discard', atMs: 100, rate: 1.02 },
      { id: 'parlour.card.flip', atMs: 200 },
      { id: 'parlour.stock.shuffle', atMs: 300 },
      { id: 'parlour.turn.ready', atMs: 400 },
    ]);
  });

  it('authors Wild Pile action-card accents from namespaced fx', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'wildpile.wild', payload: {}, at: 10 },
          { kind: 'wildpile.reverse', payload: {}, at: 20 },
          { kind: 'wildpile.skip', payload: {}, at: 30 },
          { kind: 'wildpile.draw-stack', payload: {}, at: 40 },
          { kind: 'wildpile.color', payload: {}, at: 50 },
        ],
        'wildpile',
      ),
    ).toEqual([
      { id: 'wildpile.wild.surge', atMs: 10 },
      { id: 'wildpile.reverse', atMs: 20 },
      { id: 'wildpile.skip', atMs: 30 },
      { id: 'wildpile.draw-stack', atMs: 40 },
      { id: 'wildpile.color', atMs: 50 },
    ]);
  });

  it('leaves celebration sounds to their authored choreography', () => {
    expect(
      soundCuesForFx(
        [
          { kind: Fx.Knock, payload: { seat: 0 } },
          { kind: Fx.Blitz, payload: { seat: 0 } },
          { kind: Fx.ChipLoss, payload: { seat: 1 } },
        ],
        'blitz',
      ),
    ).toEqual([]);
  });
});
