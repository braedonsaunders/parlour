import { describe, expect, it } from 'vitest';
import { LIVE_SCENE_CONTEXT } from './primitives';

describe('live scene canvas', () => {
  it('presents through the page compositor instead of a desynchronized swap chain', () => {
    expect(LIVE_SCENE_CONTEXT.alpha).toBe(false);
    expect(LIVE_SCENE_CONTEXT.desynchronized).not.toBe(true);
  });
});
