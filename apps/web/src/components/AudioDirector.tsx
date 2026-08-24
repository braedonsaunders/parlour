'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { PARLOUR_SFX } from '@/lib/audio/sfx';
import { resolveMusicContext } from '@/lib/audio/context';
import { useAudioManager, useAudioStore, useMusicController } from '@/stores/audio';

/** Preloads audio on every route, unlocks it on gesture, and keeps the music alive. */
export function AudioDirector() {
  const manager = useAudioManager();
  const controller = useMusicController();
  const unlocked = useAudioStore((state) => state.unlocked);
  const music = useAudioStore((state) => state.channels.music);
  const master = useAudioStore((state) => state.channels.master);
  const pathname = usePathname();

  useEffect(() => {
    controller.setMenu(resolveMusicContext(pathname) === 'menu');
  }, [controller, pathname]);

  useEffect(() => {
    if (!unlocked || music.muted || master.muted) return;
    controller.autoStart();
  }, [controller, unlocked, music.muted, master.muted]);

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
