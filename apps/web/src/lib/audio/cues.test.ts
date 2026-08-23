import { Fx } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { soundCuesForFx } from './cues';

describe('fx-driven table audio', () => {
  it('coalesces a deal and gives a discard spatial flight then landing', () => {
    expect(
      soundCuesForFx([
        { kind: Fx.DealCard, payload: {}, at: 0 },
        { kind: Fx.DealCard, payload: {}, at: 80 },
        { kind: Fx.DiscardCard, payload: {}, at: 200 },
      ]),
    ).toEqual([
      { id: 'deal.riffle', atMs: 0 },
      { id: 'card.slide', atMs: 200 },
      { id: 'card.snap', atMs: 350 },
    ]);
  });

  it('leaves celebration sounds to their authored choreography', () => {
    expect(
      soundCuesForFx([
        { kind: Fx.Knock, payload: { seat: 0 } },
        { kind: Fx.Blitz, payload: { seat: 0 } },
        { kind: Fx.ChipLoss, payload: { seat: 1 } },
      ]),
    ).toEqual([]);
  });
});
