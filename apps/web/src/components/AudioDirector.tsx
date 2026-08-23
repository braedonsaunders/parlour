'use client';

import { useEffect } from 'react';
import { useAudioManager, useAudioStore } from '@/stores/audio';

/** Preloads audio on every route, unlocks it on gesture, and keeps ambience alive. */
export function AudioDirector() {
  const manager = useAudioManager();
  const unlocked = useAudioStore((state) => state.unlocked);
  const music = useAudioStore((state) => state.channels.music);
  const master = useAudioStore((state) => state.channels.master);

  useEffect(() => {
    if (!unlocked || music.muted || master.muted || manager.activeVoices('music.parlour') > 0) {
      return;
    }
    manager.play('music.parlour');
  }, [manager, master.muted, music.muted, unlocked]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('button, a, [role="switch"]')) {
        manager.play('ui.pop');
      }
    };
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [manager]);

  return null;
}
