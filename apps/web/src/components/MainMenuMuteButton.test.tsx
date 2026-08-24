import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUDIO_STORAGE_KEY, resetAudioManagerForTests } from '@/lib/audio/AudioManager';
import { PROFILE_STORAGE_KEY, useProfileStore } from '@/stores/profile';
import { LOCALE_STORAGE_KEY, useLocaleStore } from '@/stores/locale';
import { MainMenuMuteButton } from './MainMenuMuteButton';

describe('MainMenuMuteButton', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    resetAudioManagerForTests();
    useLocaleStore.setState({ locale: 'en', chosen: false });
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
    // Positioning moved to the home screen's chrome cluster so the language
    // button can sit beside this one; the button keeps only its own look.
    expect(button?.className).toContain('btn-fat--ghost');
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

  it('speaks the language the player chose', async () => {
    useLocaleStore.setState({ locale: 'es', chosen: true });
    await act(async () => root.render(createElement(MainMenuMuteButton)));

    const button = container.querySelector('button');
    // Which of the two states the shared audio manager happens to be in is not
    // this test's business — that it renders Spanish in either is. Both strings
    // are checked for existence and shape by the catalogue tests.
    expect(['Silenciar el sonido', 'Activar el sonido']).toContain(
      button?.getAttribute('aria-label'),
    );
    expect(button?.textContent).toMatch(/Sonido (activado|silenciado)/);
  });

  it('keeps the chosen language across a reload', () => {
    useLocaleStore.getState().setLocale('es');
    const persisted = JSON.parse(localStorage.getItem(LOCALE_STORAGE_KEY) ?? '{}');
    expect(persisted.state).toMatchObject({ locale: 'es', chosen: true });
  });
});
