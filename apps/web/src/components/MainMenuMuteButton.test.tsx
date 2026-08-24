import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUDIO_STORAGE_KEY, resetAudioManagerForTests } from '@/lib/audio/AudioManager';
import { PROFILE_STORAGE_KEY, useProfileStore } from '@/stores/profile';
import { MainMenuMuteButton } from './MainMenuMuteButton';

describe('MainMenuMuteButton', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    resetAudioManagerForTests();
    useProfileStore.setState((state) => ({
      settings: {
        ...state.settings,
        audioMuted: { master: false, music: false, sfx: false },
      },
    }));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
  });

  it('toggles master audio and persists the preference in both stores', async () => {
    await act(async () => root.render(createElement(MainMenuMuteButton)));

    const button = container.querySelector('button');
    expect(button?.className).toContain('chrome-nw');
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    expect(button?.getAttribute('aria-label')).toBe('Mute sound');

    act(() => button?.click());

    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.getAttribute('aria-label')).toBe('Unmute sound');
    expect(JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) ?? '{}').channels.master.muted).toBe(
      true,
    );
    expect(
      JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) ?? '{}').state.settings.audioMuted
        .master,
    ).toBe(true);
  });
});
