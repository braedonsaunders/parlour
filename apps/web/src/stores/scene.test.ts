import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCENE_STORAGE_KEY } from './scene';

/**
 * The store runs its cookie-fallback boot logic at import time, so each test
 * arranges storage first and then imports a fresh copy of the module.
 */
describe('scene persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.cookie = 'parlour.scene=; max-age=0; path=/';
  });

  it('restores the last background from the cookie when storage was wiped', async () => {
    document.cookie = 'parlour.scene=beach; path=/';
    const { useSceneStore } = await import('./scene');
    expect(useSceneStore.getState().sceneId).toBe('beach');
    expect(localStorage.getItem(SCENE_STORAGE_KEY)).toContain('beach');
  });

  it('prefers the persisted store over the cookie', async () => {
    localStorage.setItem(
      SCENE_STORAGE_KEY,
      JSON.stringify({ state: { sceneId: 'casino' }, version: 1 }),
    );
    document.cookie = 'parlour.scene=beach; path=/';
    const { useSceneStore } = await import('./scene');
    expect(useSceneStore.getState().sceneId).toBe('casino');
  });

  it('mirrors every scene change into the cookie', async () => {
    const { useSceneStore } = await import('./scene');
    useSceneStore.getState().setScene('snug');
    expect(document.cookie).toContain('parlour.scene=snug');
    expect(localStorage.getItem(SCENE_STORAGE_KEY)).toContain('snug');
  });

  it('ignores a cookie that names no real scene', async () => {
    document.cookie = 'parlour.scene=disco; path=/';
    const { useSceneStore } = await import('./scene');
    expect(useSceneStore.getState().sceneId).toBe('campfire');
  });
});
