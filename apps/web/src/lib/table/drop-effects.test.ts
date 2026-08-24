import { Fx } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { WILD_DROP_EFFECTS } from '@/lib/wild/drop-effects';
import { dropEffectsForFx, getDropEffectPack } from './drop-effects';

describe('card-drop effects', () => {
  it('registers the Wild pack and gives every action card its own flourish', () => {
    expect(getDropEffectPack('wildpile')).toBe(WILD_DROP_EFFECTS);

    const shapeOf = (card: string) => WILD_DROP_EFFECTS.effectFor(card)?.shape;
    expect(shapeOf('red-reverse-0')).toBe('swirl');
    expect(shapeOf('blue-skip-1')).toBe('slash');
    expect(shapeOf('green-draw-two-0')).toBe('sparks');
    expect(shapeOf('wild-draw-four-0')).toBe('sparks');
    expect(shapeOf('wild-0')).toBe('prism');
    expect(shapeOf('wild-swap-0')).toBe('trade');
    expect(shapeOf('wild-shuffle-0')).toBe('prism');
    // House-rule numbers land harder than the rest.
    expect(shapeOf('yellow-7-0')).toBe('shockwave');
    expect(shapeOf('yellow-0-0')).toBe('shockwave');
    expect(shapeOf('yellow-3-0')).toBe('ripple');
  });

  it('tints coloured cards with their own colour and wilds with the prism white', () => {
    expect(WILD_DROP_EFFECTS.effectFor('red-5-0')?.color).toBe('#e0685c');
    expect(WILD_DROP_EFFECTS.effectFor('wild-0')?.color).toBe('#f0e2ff');
  });

  it('fires only on cards landing on the pile, timed to the card flight', () => {
    const effects = dropEffectsForFx(
      [
        { kind: Fx.DiscardCard, payload: { card: 'red-reverse-0', seat: 0 }, at: 0 },
        { kind: Fx.DrawCard, payload: { card: 'blue-2-0', seat: 1 }, at: 40 },
        { kind: Fx.FlipCard, payload: { card: 'green-4-0' }, at: 200 },
        { kind: 'wildpile.skip', payload: { seat: 1 } },
      ],
      'wildpile',
    );

    expect(effects.map((effect) => effect.shape)).toEqual(['swirl', 'ripple']);
    expect(effects.map((effect) => effect.atMs)).toEqual([170, 370]);
  });

  it('stays quiet for a game that ships no pack', () => {
    expect(
      dropEffectsForFx([{ kind: Fx.DiscardCard, payload: { card: 'red-5-0', seat: 0 } }], 'blitz'),
    ).toEqual([]);
    expect(dropEffectsForFx([], null)).toEqual([]);
  });
});
