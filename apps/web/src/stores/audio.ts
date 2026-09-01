'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  getAudioManager,
  type AudioChannel,
  type AudioManager,
  type AudioSettings,
} from '@/lib/audio/AudioManager';
import {
  getMusicController,
  resetMusicControllerForTests,
  type MusicController,
  type MusicState,
} from '@/lib/audio/MusicController';
import { BASE_PACK_ID, type MusicMoodId } from '@/lib/audio/music';
import { SOUND_MANIFEST } from '@/lib/audio/manifest';
import { useSceneStore } from '@/stores/scene';
import { useProfileStore } from '@/stores/profile';

type AudioStore = {
  channels: AudioSettings;
  unlocked: boolean;
  setVolume: (channel: AudioChannel, volume: number) => void;
  setMuted: (channel: AudioChannel, muted: boolean) => void;
  toggleMuted: (channel: AudioChannel) => void;
};

export const useAudioStore = create<AudioStore>(() => ({
  channels: DEFAULT_SETTINGS,
  unlocked: false,
  setVolume: (channel, volume) => getAudioManager().setVolume(channel, volume),
  setMuted: (channel, muted) => getAudioManager().setMuted(channel, muted),
  toggleMuted: (channel) => getAudioManager().toggleMuted(channel),
}));

type MusicStore = MusicState & {
  toggle: () => void;
  next: () => void;
  previous: () => void;
  selectTrack: (trackId: string) => void;
  toggleShuffle: () => void;
};

export const useMusicStore = create<MusicStore>(() => ({
  status: 'idle',
  trackId: null,
  shuffle: false,
  packId: BASE_PACK_ID,
  mood: null,
  rate: 1,
  duck: 1,
  toggle: () => getMusicController().toggle(),
  next: () => getMusicController().next(),
  previous: () => getMusicController().previous(),
  selectTrack: (trackId) => getMusicController().play(trackId),
  toggleShuffle: () => getMusicController().toggleShuffle(),
}));

let bound = false;
let musicBound = false;

function bindManager(manager: AudioManager): void {
  if (bound) return;
  bound = true;

  const persistedMutes = useProfileStore.getState().settings.audioMuted;
  for (const channel of ['master', 'music', 'sfx'] as const) {
    if (manager.getSettings()[channel].muted !== persistedMutes[channel]) {
      manager.setMuted(channel, persistedMutes[channel]);
    }
  }

  useAudioStore.setState({ channels: manager.getSettings(), unlocked: manager.isUnlocked() });
  manager.subscribe((channels) => {
    useAudioStore.setState({ channels, unlocked: manager.isUnlocked() });
    const profile = useProfileStore.getState();
    const audioMuted = {
      master: channels.master.muted,
      music: channels.music.muted,
      sfx: channels.sfx.muted,
    };
    if (
      profile.settings.audioMuted.master !== audioMuted.master ||
      profile.settings.audioMuted.music !== audioMuted.music ||
      profile.settings.audioMuted.sfx !== audioMuted.sfx
    ) {
      profile.updateSettings({ audioMuted });
    }
  });
}

function bindMusic(): void {
  if (musicBound) return;
  musicBound = true;

  const controller = getMusicController();
  useMusicStore.setState(controller.getState());
  controller.subscribe((state) => useMusicStore.setState(state));
}

export function useAudioManager(): AudioManager {
  const manager = getAudioManager();

  useEffect(() => {
    bindManager(manager);
    manager.preload(SOUND_MANIFEST);
    manager.unlock();
  }, [manager]);

  return manager;
}

/** Binds the shared MusicController (audio settings + active scene) and returns it. */
export function useMusicController(): MusicController {
  const manager = useAudioManager();

  useEffect(() => {
    bindMusic();
    const controller = getMusicController(manager);
    controller.setScene(useSceneStore.getState().sceneId);
    const unsubscribeScene = useSceneStore.subscribe((scene, prev) => {
      if (scene.sceneId !== prev.sceneId) controller.setScene(scene.sceneId);
    });
    return unsubscribeScene;
  }, [manager]);

  return getMusicController(manager);
}

/**
 * Declarative music mood for game screens: pass the cue the current game state
 * implies (or null), and the soundtrack follows. Leaving the table releases it.
 */
export function useMusicMood(mood: MusicMoodId | null): void {
  const controller = useMusicController();

  useEffect(() => {
    controller.setMood(mood);
  }, [controller, mood]);

  useEffect(() => () => getMusicController().setMood(null), []);
}

/**
 * The Mario-Kart final-minute lift: while `active`, the current song plays
 * slightly faster with its pitch riding along. Leaving the table releases it.
 */
export function useMusicFrantic(active: boolean, rate = 1.07): void {
  const controller = useMusicController();

  useEffect(() => {
    controller.setFrantic(active ? rate : null);
  }, [active, controller, rate]);

  useEffect(() => () => getMusicController().setFrantic(null), []);
}

/**
 * Declarative soundtrack pack for game screens: the table plays its own pack
 * while mounted, and leaving restores whatever the player had picked before.
 */
export function useMusicGamePack(packId: string | null): void {
  const controller = useMusicController();

  useEffect(() => {
    if (!packId) return;
    const previous = controller.getState().packId;
    controller.setPack(packId);
    return () => {
      const live = getMusicController();
      // Only step back if nothing else (the settings menu, another table)
      // changed the pack while this screen held it.
      if (live.getState().packId === packId) live.setPack(previous);
    };
  }, [controller, packId]);
}

export function resetMusicBindingsForTests(): void {
  bound = false;
  musicBound = false;
  resetMusicControllerForTests();
}
