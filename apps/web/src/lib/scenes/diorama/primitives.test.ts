import { describe, expect, it } from 'vitest';
import { LIVE_SCENE_CONTEXT, sceneBufferSize, sceneBufferUnchanged } from './primitives';

describe('live scene canvas', () => {
  it('presents through the page compositor instead of a desynchronized swap chain', () => {
    expect(LIVE_SCENE_CONTEXT.alpha).toBe(false);
    expect(LIVE_SCENE_CONTEXT.desynchronized).not.toBe(true);
  });

  it('treats an identical viewport as a no-op so a menu hop cannot clear the bitmap', () => {
    const size = sceneBufferSize(1440, 900, 2, false);
    expect(size.bufferWidth).toBe(2880);
    expect(size.bufferHeight).toBe(1800);
    expect(sceneBufferUnchanged(size, sceneBufferSize(1440, 900, 2, false))).toBe(true);
    expect(sceneBufferUnchanged(size, sceneBufferSize(1423, 900, 2, false))).toBe(false);
  });
});
