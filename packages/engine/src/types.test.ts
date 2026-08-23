import { describe, expect, it } from 'vitest';
import { createFx, rngSeedFrom } from './types';

describe('engine contracts', () => {
  it('seeds deterministically from text', () => {
    expect(rngSeedFrom('blitz')).toBe(rngSeedFrom('blitz'));
    expect(rngSeedFrom('blitz')).not.toBe(rngSeedFrom('wildpile'));
  });

  it('fx emitter collects ordered events', () => {
    const fx = createFx();
    fx.emit('card.fly', { card: 'S1' });
    fx.emit('burst.knock', { seat: 2 }, 120);
    expect(fx.events).toHaveLength(2);
    expect(fx.events[0]?.kind).toBe('card.fly');
    expect(fx.events[1]?.at).toBe(120);
  });
});
