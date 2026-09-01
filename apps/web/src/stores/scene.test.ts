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

  it('ignores a cookie that names no real scene and deals a random one instead', async () => {
    document.cookie = 'parlour.scene=disco; path=/';
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { useSceneStore, SCENE_IDS } = await import('./scene');
    expect(useSceneStore.getState().sceneId).toBe(SCENE_IDS[SCENE_IDS.length - 1]);
  });

  it('deals a random background on a first visit without persisting the roll', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.8);
    const { useSceneStore, SCENE_IDS } = await import('./scene');
    expect(useSceneStore.getState().sceneId).toBe(SCENE_IDS[3]);
    // The roll is per-session: nothing sticks until the player chooses.
    expect(localStorage.getItem(SCENE_STORAGE_KEY)).toBeNull();
    expect(document.cookie).not.toContain('parlour.scene=');
  });

  it('an explicit pick still persists over a prior random roll', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const { useSceneStore } = await import('./scene');
    useSceneStore.getState().setScene('casino');
    expect(localStorage.getItem(SCENE_STORAGE_KEY)).toContain('casino');
    expect(document.cookie).toContain('parlour.scene=casino');
  });
});
