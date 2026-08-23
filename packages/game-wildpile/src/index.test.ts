import { describe, expect, it } from 'vitest';
import { GAME_ID } from './index';

describe('game-wildpile', () => {
  it('has the wildpile game id', () => {
    expect(GAME_ID).toBe('wildpile');
  });
});
