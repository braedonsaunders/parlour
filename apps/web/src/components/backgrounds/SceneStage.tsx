'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import s from '@/styles/scenes.module.css';
import { useProfileStore } from '@/stores/profile';
import { useSceneStore, type SceneId } from '@/stores/scene';
import { CampfireScene } from './CampfireScene';
import { CasinoScene } from './CasinoScene';
import { SnugScene } from './SnugScene';

const SCENES: Record<SceneId, React.FC> = {
  campfire: CampfireScene,
  casino: CasinoScene,
  snug: SnugScene,
};

const PARALLAX_DEPTHS = [4, 10, 18, 26] as const;
const DAMPING = 0.06;

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
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneId = useSceneStore((state) => state.sceneId);
  const reducedMotion = useProfileStore((state) => state.settings.reducedMotion);
  const hydrated = useHydrated();

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches || reducedMotion) return;

    const layers = Array.from(stage.querySelectorAll<HTMLElement>('[data-parallax]'));

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let frame = 0;

    const onPointerMove = (event: PointerEvent) => {
      targetX = event.clientX / window.innerWidth - 0.5;
      targetY = event.clientY / window.innerHeight - 0.5;
    };

    const tick = () => {
      currentX += (targetX - currentX) * DAMPING;
      currentY += (targetY - currentY) * DAMPING;

      for (let i = 0; i < layers.length; i += 1) {
        const layer = layers[i];
        if (!layer) continue;
        const depth = PARALLAX_DEPTHS[i] ?? 0;
        layer.style.transform = `translate3d(${(-currentX * depth).toFixed(2)}px, ${(
          -currentY *
          depth *
          0.55
        ).toFixed(2)}px, 0)`;
      }

      frame = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      cancelAnimationFrame(frame);
    };
  }, [sceneId, hydrated, reducedMotion]);

  const Scene = SCENES[sceneId];

  return (
    <div ref={stageRef} className={s.stage} aria-hidden="true">
      {hydrated ? <Scene key={sceneId} /> : null}
      <div className={s.tilt} />
      <div className={s.vignette} />
    </div>
  );
}

export default SceneStage;
