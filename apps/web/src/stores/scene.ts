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

export const useSceneStore = create<SceneState>()(
  persist(
    (set) => ({
      sceneId: DEFAULT_SCENE,
      setScene: (sceneId) => set({ sceneId }),
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
