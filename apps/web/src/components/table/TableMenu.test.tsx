import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAudioManagerForTests } from '@/lib/audio/AudioManager';
import { MUSIC_STORAGE_KEY, resetMusicControllerForTests } from '@/lib/audio/MusicController';
import { SCENE_STORAGE_KEY, DEFAULT_SCENE, useSceneStore } from '@/stores/scene';
import { resetMusicBindingsForTests } from '@/stores/audio';
import { TableMenu } from './TableMenu';

const { FakeHowl } = vi.hoisted(() => {
  class FakeHowl {
    src: string;
    constructor(opts: { src: string[] }) {
      this.src = opts.src[0]!;
    }
    play(): number {
      return 1;
    }
    pause(): void {}
    stop(): void {}
    unload(): void {}
    fade(): void {}
    volume(): number | this {
      return this;
    }
    seek(): number | this {
      return this;
    }
    once(): this {
      return this;
    }
  }
  return { FakeHowl };
});

vi.mock('howler', () => ({ Howl: FakeHowl, Howler: { volume: () => {}, ctx: undefined } }));

describe('TableMenu', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    useSceneStore.setState({ sceneId: DEFAULT_SCENE });
    resetAudioManagerForTests();
    resetMusicControllerForTests();
    resetMusicBindingsForTests();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
  });

  const render = async (props: Parameters<typeof TableMenu>[0]) =>
    act(async () => root.render(createElement(TableMenu, props)));

  const buttonByText = (text: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

  it('renders nothing while closed', async () => {
    await render({ open: false, onClose: () => {}, onQuit: () => {} });
    expect(container.querySelector('[data-testid="table-menu"]')).toBeNull();
  });

  it('only quits after the confirm step', async () => {
    const onQuit = vi.fn();
    const onClose = vi.fn();
    await render({ open: true, onClose, onQuit });

    const quitToMenu = buttonByText('Quit to main menu');
    expect(quitToMenu).toBeDefined();
    act(() => quitToMenu?.click());
    expect(onQuit).not.toHaveBeenCalled();

    const confirm = container.querySelector<HTMLButtonElement>('[data-testid="confirm-quit"]');
    expect(confirm?.textContent).toContain('Quit match');
    act(() => confirm?.click());
    expect(onQuit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('lets the player back out of the confirm step', async () => {
    const onQuit = vi.fn();
    await render({ open: true, onClose: () => {}, onQuit });

    act(() => buttonByText('Quit to main menu')?.click());
    act(() => buttonByText('Keep playing')?.click());

    expect(onQuit).not.toHaveBeenCalled();
    expect(buttonByText('Quit to main menu')).toBeDefined();
  });

  it('closes without quitting via the resume button and Escape', async () => {
    const onQuit = vi.fn();
    const onClose = vi.fn();
    await render({ open: true, onClose, onQuit });

    act(() => buttonByText('Back to the table')?.click());
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onQuit).not.toHaveBeenCalled();
  });

  it('changes the background scene from the settings modal', async () => {
    await render({ open: true, onClose: () => {}, onQuit: () => {} });

    const casino = container.querySelector<HTMLButtonElement>('[data-testid="scene-casino"]');
    expect(casino?.getAttribute('aria-checked')).toBe('false');

    act(() => casino?.click());
    expect(casino?.getAttribute('aria-checked')).toBe('true');
    expect(JSON.parse(localStorage.getItem(SCENE_STORAGE_KEY)!).state.sceneId).toBe('casino');
  });

  it('plays music from the music section and reflects the state', async () => {
    await render({ open: true, onClose: () => {}, onQuit: () => {} });

    expect(container.querySelector('[data-testid="music-section"]')).not.toBeNull();
    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="music-toggle"]')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    act(() => toggle.click());
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(JSON.parse(localStorage.getItem(MUSIC_STORAGE_KEY)!).trackId).toBe('campfire-1');
    expect(container.querySelector('[data-testid="music-track-title"]')?.textContent).toContain(
      'Ember Watch',
    );
  });
});
