import { describe, expect, it } from 'vitest';
import {
  AWARD_KINDS,
  DECK,
  GAME_SEATS,
  PERSONAS,
  TIER_BOTS,
  orderScopaHand,
  scopaCatalog,
  scopaConfig,
  scopaGame,
} from './index';
import { orderedHand } from '@parlour/engine';

describe('the public package surface', () => {
  it('exposes a complete GameDef', () => {
    expect(scopaGame.id).toBe('scopa');
    expect(Object.keys(scopaGame.moves).sort()).toEqual(
      ['deal', 'finishRound', 'nextRound', 'playCard'].sort(),
    );
    expect(scopaGame.bots.length).toBe(TIER_BOTS.length);
    expect(scopaGame.howToPlay.sections.length).toBeGreaterThan(2);
  });

  it('wires the catalog to real presets and seats', () => {
    expect(scopaCatalog.gameId).toBe(scopaGame.id);
    expect(scopaCatalog.seats).toEqual([2, 3, 4, 6]);
    const presetIds = new Set(scopaConfig.presets.map((preset) => preset.id));
    for (const mode of scopaCatalog.modes) {
      if (mode.preset) expect(presetIds.has(mode.preset)).toBe(true);
    }
    // Cassino is deliberately not part of this package's scope
    expect(scopaCatalog.modes.some((mode) => mode.id === 'cassino')).toBe(false);
  });

  it('resolves configs idempotently and clamps unknown values', () => {
    const once = scopaConfig.resolve({});
    const twice = scopaConfig.resolve(once);
    expect(twice).toEqual(once);
    expect(once.target).toBe(11);
    expect(once.frenchSuits).toBe(true);
    expect(scopaConfig.resolve({ target: 99 as 11 }).target).toBe(11); // coerced back
    const lungo = scopaConfig.resolve({ ...once, target: 21 });
    expect(lungo.target).toBe(21);
    expect(scopaConfig.resolve(lungo)).toEqual(lungo);
  });

  it('keeps award kinds, deck size and seat options honest', () => {
    expect(AWARD_KINDS).toEqual([
      'carte',
      'denari',
      'settebello',
      'primiera',
      'scope',
      'napola',
      're-denari',
    ]);
    expect(DECK.cardIds).toHaveLength(40);
    expect([...GAME_SEATS]).toEqual([2, 3, 4, 6]);
  });

  it('handOrder survives the engine conservation check', () => {
    const shuffled = [...DECK.cardIds].reverse();
    expect(orderedHand(shuffled, orderScopaHand)).toHaveLength(40);
  });

  it('ships named personas with unique ids', () => {
    const ids = PERSONAS.map((persona) => persona.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
