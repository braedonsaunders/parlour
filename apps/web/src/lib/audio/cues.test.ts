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

  it('layers Wild Pile action-card Foley with human callouts', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'wildpile.reverse', payload: {}, at: 20 },
          { kind: 'wildpile.skip', payload: {}, at: 30 },
        ],
        'wildpile',
      ),
    ).toEqual([
      { id: 'wildpile.reverse', atMs: 140 },
      { id: 'wildpile.voice.reverse', atMs: 320 },
      { id: 'wildpile.skip', atMs: 150 },
      { id: 'wildpile.voice.skip', atMs: 330 },
    ]);
  });

  it('distinguishes draw-two, stacked, and wild-draw-four announcements', () => {
    expect(
      soundCuesForFx([{ kind: 'wildpile.draw-stack', payload: { amount: 2 }, at: 0 }], 'wildpile'),
    ).toEqual([
      { id: 'wildpile.draw-stack', atMs: 120 },
      { id: 'wildpile.voice.draw-two', atMs: 320 },
    ]);

    expect(
      soundCuesForFx([{ kind: 'wildpile.draw-stack', payload: { amount: 6 }, at: 0 }], 'wildpile'),
    ).toEqual([
      { id: 'wildpile.draw-stack', atMs: 120 },
      { id: 'wildpile.voice.stacked', atMs: 320 },
    ]);

    expect(
      soundCuesForFx(
        [
          { kind: 'wildpile.draw-stack', payload: { amount: 4 }, at: 0 },
          { kind: 'wildpile.wild', payload: {}, at: 0 },
        ],
        'wildpile',
      ),
    ).toEqual([
      { id: 'wildpile.draw-stack', atMs: 120 },
      { id: 'wildpile.voice.draw-four', atMs: 320 },
      { id: 'wildpile.wild.surge', atMs: 120 },
    ]);
  });

  it('announces wild color switches and the last-card moment', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'wildpile.wild', payload: {}, at: 0 },
          { kind: 'wildpile.color', payload: { color: 'blue' }, at: 500 },
          { kind: 'wildpile.last-card', payload: { seat: 0 }, at: 0 },
        ],
        'wildpile',
      ),
    ).toEqual([
      { id: 'wildpile.wild.surge', atMs: 120 },
      { id: 'wildpile.voice.wild', atMs: 320 },
      { id: 'wildpile.color', atMs: 500 },
      { id: 'wildpile.voice.blue', atMs: 600 },
      { id: 'wildpile.voice.last-card', atMs: 950 },
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
