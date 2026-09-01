import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const SCENE_STORAGE_KEY = 'parlour.scene.v1';

export const SCENE_IDS = ['campfire', 'casino', 'snug', 'beach'] as const;

export type SceneId = (typeof SCENE_IDS)[number];

export const SCENE_LABELS: Record<SceneId, string> = {
  campfire: 'Campfire',
  casino: 'Casino',
  snug: 'Snug',
  beach: 'Beach',
};

export const DEFAULT_SCENE: SceneId = 'campfire';

export function isSceneId(value: unknown): value is SceneId {
  return typeof value === 'string' && (SCENE_IDS as readonly string[]).includes(value);
}

type SceneState = {
  sceneId: SceneId;
  setScene: (sceneId: SceneId) => void;
};

/**
 * A long-lived cookie mirrors the persisted pick. localStorage is the source
 * of truth, but it is also the first thing lost to storage pressure, a WebKit
 * eviction, or an over-eager "clear site data" — and losing it silently reset
 * the table to the default background. The cookie is the backup copy: if the
 * store boots with no persisted state but the cookie survived, the player
 * keeps the background they chose.
 */
const SCENE_COOKIE = 'parlour.scene';

function writeSceneCookie(sceneId: SceneId): void {
  try {
    document.cookie = `${SCENE_COOKIE}=${sceneId}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* SSR, or cookies blocked — localStorage still carries the pick */
  }
}

function readSceneCookie(): SceneId | null {
  try {
    const value = document.cookie.match(/(?:^|;\s*)parlour\.scene=([^;]+)/)?.[1];
    return isSceneId(value) ? value : null;
  } catch {
    return null;
  }
}

export const useSceneStore = create<SceneState>()(
  persist(
    (set) => ({
      sceneId: DEFAULT_SCENE,
      setScene: (sceneId) => {
        set({ sceneId });
        writeSceneCookie(sceneId);
      },
    }),
    {
      name: SCENE_STORAGE_KEY,
      version: 1,
      migrate: (persisted) => {
        const state = persisted as Partial<SceneState> | undefined;
        return { sceneId: isSceneId(state?.sceneId) ? state.sceneId : DEFAULT_SCENE };
      },
      partialize: (state) => ({ sceneId: state.sceneId }),
    },
  ),
);

if (typeof window !== 'undefined') {
  try {
    if (window.localStorage.getItem(SCENE_STORAGE_KEY) === null) {
      // First boot on this storage — or the storage was wiped. The cookie is
      // the last pick that survived; setScene re-seeds localStorage from it.
      const remembered = readSceneCookie();
      if (remembered) {
        useSceneStore.getState().setScene(remembered);
      } else {
        // Nobody has ever chosen: deal a random background instead of always
        // opening on the campfire. The roll is per-session — nothing persists
        // until the player actually picks one, so tomorrow deals fresh.
        const rolled = SCENE_IDS[Math.floor(Math.random() * SCENE_IDS.length)] ?? DEFAULT_SCENE;
        useSceneStore.getState().setScene(rolled);
        window.localStorage.removeItem(SCENE_STORAGE_KEY);
        document.cookie = `${SCENE_COOKIE}=; path=/; max-age=0`;
      }
    } else {
      writeSceneCookie(useSceneStore.getState().sceneId);
    }
    // Ask the browser not to evict our storage under pressure. Chromium
    // grants this quietly for installed PWAs; elsewhere it is a harmless no.
    void window.navigator.storage?.persist?.();
  } catch {
    /* private mode without storage — the session default stands */
  }
}
