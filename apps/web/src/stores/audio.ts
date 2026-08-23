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
import { SOUND_MANIFEST } from '@/lib/audio/manifest';
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

let bound = false;

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

export function useAudioManager(): AudioManager {
  const manager = getAudioManager();

  useEffect(() => {
    bindManager(manager);
    manager.preload(SOUND_MANIFEST);
    manager.unlock();
  }, [manager]);

  return manager;
}
