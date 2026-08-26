'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { PARLOUR_SFX } from '@/lib/audio/sfx';
import { resolveMusicContext } from '@/lib/audio/context';
import { keepMenuAudioAlive } from '@/lib/menu/keepAlive';
import { useAudioManager, useMusicController } from '@/stores/audio';

/** Preloads audio on every route, unlocks it on gesture, and keeps the music alive. */
export function AudioDirector() {
  const manager = useAudioManager();
  const controller = useMusicController();
  const pathname = usePathname();

  useEffect(() => {
    controller.setMenu(resolveMusicContext(pathname) === 'menu');
    const kick = () => {
      if (!manager.isPageActive() || !manager.isUnlocked() || manager.gainFor('music') <= 0) return;
      controller.autoStart();
      keepMenuAudioAlive();
    };
    const unsubscribe = manager.subscribe(kick);
    kick();
    return unsubscribe;
  }, [controller, manager, pathname]);

  useEffect(() => {
    controller.setPageActive(manager.isPageActive());
    return manager.subscribePageActive((active) => controller.setPageActive(active));
  }, [controller, manager]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('button, a, [role="switch"]')) {
        manager.play(PARLOUR_SFX.uiPress);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [manager]);

  return null;
}
