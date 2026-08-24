import { Fx } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { wildPickup } from './pickup';

function drawFx(seat: number, at: number) {
  return { kind: Fx.DrawCard, payload: { card: `red-${at}-0`, seat, from: 'stock' }, at };
}

describe('wildPickup', () => {
  it('reads the announced pickup and lines the counter up with the real flights', () => {
    const pickup = wildPickup([
      { kind: Fx.DiscardCard, payload: { card: 'wild-draw-four-0', seat: 0 }, at: 0 },
      { kind: 'wildpile.pickup', payload: { seat: 1, amount: 4, reason: 'penalty' }, at: 300 },
      drawFx(1, 300),
      drawFx(1, 450),
      drawFx(1, 600),
      drawFx(1, 750),
    ]);

    expect(pickup).toMatchObject({ seat: 1, amount: 4, reason: 'penalty', startMs: 300 });
    expect(pickup?.landings).toEqual([300, 450, 600, 750]);
  });

  it('ignores draws belonging to another seat or predating the pickup', () => {
    const pickup = wildPickup([
      drawFx(0, 0),
      { kind: 'wildpile.pickup', payload: { seat: 1, amount: 2, reason: 'caught' }, at: 300 },
      drawFx(1, 300),
      drawFx(1, 450),
    ]);

    expect(pickup?.landings).toEqual([300, 450]);
    expect(pickup?.reason).toBe('caught');
  });

  it('stays quiet for a draw the seat chose, and for a malformed event', () => {
    expect(wildPickup([drawFx(0, 0)])).toBeNull();
    expect(wildPickup([{ kind: 'wildpile.pickup', payload: { seat: 1, amount: 0 } }])).toBeNull();
    expect(wildPickup([{ kind: 'wildpile.pickup', payload: {} }])).toBeNull();
  });

  it('falls back to a penalty for an unknown reason rather than dropping the count', () => {
    const pickup = wildPickup([
      { kind: 'wildpile.pickup', payload: { seat: 2, amount: 1, reason: 'mystery' } },
      drawFx(2, 0),
    ]);
    expect(pickup?.reason).toBe('penalty');
  });
});
