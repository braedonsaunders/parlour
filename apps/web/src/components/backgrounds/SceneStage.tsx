'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import s from '@/styles/scenes.module.css';
import { mountParlourDiorama } from '@/lib/scenes/parlour-diorama';
import { useProfileStore } from '@/stores/profile';
import { useSceneStore } from '@/stores/scene';

const noopSubscribe = () => () => {};

/** True after hydration; scenes render client-side only so persisted picks never mismatch SSR. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function SceneStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneId = useSceneStore((state) => state.sceneId);
  const reducedMotion = useProfileStore((state) => state.settings.reducedMotion);
  const hydrated = useHydrated();
  const sceneRef = useRef(sceneId);
  const reducedRef = useRef(reducedMotion);

  useEffect(() => {
    sceneRef.current = sceneId;
    reducedRef.current = reducedMotion;
  }, [sceneId, reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!hydrated || !canvas) return;
    return mountParlourDiorama(canvas, {
      getScene: () => sceneRef.current,
      getReducedMotion: () => reducedRef.current,
    });
  }, [hydrated, reducedMotion]);

  return (
    <div className={s.stage} aria-hidden="true">
      {hydrated ? <canvas ref={canvasRef} className={s.canvas} /> : null}
    </div>
  );
}

export default SceneStage;
