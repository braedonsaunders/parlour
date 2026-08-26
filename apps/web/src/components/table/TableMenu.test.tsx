import { act, createElement } from 'react';
import type { HowToPlayDoc } from '@parlour/engine';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAudioManagerForTests } from '@/lib/audio/AudioManager';
import { MUSIC_STORAGE_KEY, resetMusicControllerForTests } from '@/lib/audio/MusicController';
import { SCENE_STORAGE_KEY, DEFAULT_SCENE, useSceneStore } from '@/stores/scene';
import { resetMusicBindingsForTests } from '@/stores/audio';
import { DEFAULT_APP_COLOR_MODE, DEFAULT_DROP_EFFECTS, useTableFxStore } from '@/stores/tableFx';
import { useLocaleStore } from '@/stores/locale';
import { TableMenu } from './TableMenu';

const HOW_TO_PLAY: HowToPlayDoc = {
  summary: 'A tiny demo game.',
  objective: 'Run out of demo cards.',
  sections: [{ heading: 'Turns', body: ['Play a card.'] }],
};

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
    playing(): boolean {
      return true;
    }
    volume(): number | this {
      return this;
    }
    seek(): number | this {
      return this;
    }
    on(): this {
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
    useLocaleStore.setState({ locale: 'en', chosen: false });
    useSceneStore.setState({ sceneId: DEFAULT_SCENE });
    useTableFxStore.setState({
      dropEffects: DEFAULT_DROP_EFFECTS,
      appColorMode: DEFAULT_APP_COLOR_MODE,
    });
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
    expect(confirm?.className).toContain('btn-fat--danger');
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

  it('keeps keyboard focus inside the dialog and restores the table control on close', async () => {
    const tableControl = document.createElement('button');
    tableControl.textContent = 'Open table menu';
    document.body.prepend(tableControl);
    tableControl.focus();

    await render({ open: true, onClose: () => {}, onQuit: () => {} });

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    const focusable = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    expect(dialog.contains(document.activeElement)).toBe(true);

    const chosenControl = focusable[1]!;
    chosenControl.focus();
    await render({ open: true, onClose: () => {}, onQuit: () => {} });
    expect(document.activeElement).toBe(chosenControl);

    focusable.at(-1)?.focus();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.activeElement).toBe(focusable[0]);

    focusable[0]?.focus();
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(focusable.at(-1));

    await render({ open: false, onClose: () => {}, onQuit: () => {} });
    expect(document.activeElement).toBe(tableControl);
    tableControl.remove();
  });

  it('lets the nested rules sheet close with Escape before the table menu', async () => {
    const onClose = vi.fn();
    await render({
      open: true,
      onClose,
      onQuit: () => {},
      howToPlay: { doc: HOW_TO_PLAY, title: 'Demo' },
    });

    const rulesTrigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="how-to-play-demo"]',
    )!;
    rulesTrigger.focus();
    act(() => rulesTrigger.click());
    expect(document.querySelector('[data-testid="how-to-play"]')).not.toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(document.querySelector('[data-testid="how-to-play"]')).toBeNull();
    expect(document.activeElement).toBe(rulesTrigger);
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('changes the background scene from the settings modal', async () => {
    await render({ open: true, onClose: () => {}, onQuit: () => {} });

    const casino = container.querySelector<HTMLButtonElement>('[data-testid="scene-casino"]');
    expect(casino?.getAttribute('aria-checked')).toBe('false');

    act(() => casino?.click());
    expect(casino?.getAttribute('aria-checked')).toBe('true');
    expect(JSON.parse(localStorage.getItem(SCENE_STORAGE_KEY)!).state.sceneId).toBe('casino');
  });

  it('offers no palette choice — the app has one look', async () => {
    await render({ open: true, onClose: () => {}, onQuit: () => {} });

    // The picker used to live here. The palette is fixed now, so the menu must
    // not offer a control that cannot change anything.
    expect(container.querySelector('[data-testid="app-colors-picker"]')).toBeNull();
    expect(container.querySelector('[data-testid="app-colors-original"]')).toBeNull();
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

  it('renders every table-menu control in the selected language', async () => {
    useLocaleStore.setState({ locale: 'es', chosen: true });
    await render({ open: true, onClose: () => {}, onQuit: () => {} });

    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
      'Menú de la mesa',
    );
    expect(buttonByText('Volver a la mesa')).toBeDefined();
    expect(buttonByText('Salir al menú principal')).toBeDefined();
    expect(container.textContent).toContain('Efectos de las cartas');
  });
});
