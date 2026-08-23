import { describe, expect, it } from 'vitest';
import { GAME_ID } from './index';

describe('game-blitz', () => {
  it('has the blitz game id', () => {
    expect(GAME_ID).toBe('blitz');
  });
});
