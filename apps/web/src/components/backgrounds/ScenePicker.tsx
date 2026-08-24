'use client';

import { SCENE_IDS, SCENE_LABELS, useSceneStore } from '@/stores/scene';
import { useHydrated } from './SceneStage';

const SCENE_ICONS: Record<(typeof SCENE_IDS)[number], string> = {
  campfire: '🔥',
  casino: '🎲',
  snug: '🛋️',
};

export function ScenePicker() {
  const sceneId = useSceneStore((state) => state.sceneId);
  const setScene = useSceneStore((state) => state.setScene);
  const hydrated = useHydrated();
  if (!hydrated) return null;

  return (
    <div
      className="pill-soft chrome-sw absolute z-30 flex items-center gap-1"
      role="radiogroup"
      aria-label="Background scene"
    >
      {SCENE_IDS.map((id) => {
        const active = id === sceneId;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            title={SCENE_LABELS[id]}
            onClick={() => setScene(id)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-150 ease-pop ${
              active
                ? 'bg-hearth-400/25 text-hearth-100'
                : 'text-dusk-200/70 hover:-translate-y-0.5 hover:text-dusk-100'
            }`}
          >
            <span aria-hidden="true">{SCENE_ICONS[id]}</span>
            <span className={active ? '' : 'sr-only sm:not-sr-only'}>{SCENE_LABELS[id]}</span>
          </button>
        );
      })}
    </div>
  );
}
