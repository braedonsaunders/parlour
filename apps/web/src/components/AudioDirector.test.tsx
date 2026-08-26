import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, resetAudioManagerForTests } from '@/lib/audio/AudioManager';
import { resetMusicBindingsForTests, useAudioStore } from '@/stores/audio';

const nav = { pathname: '/' };

const { FakeHowl } = vi.hoisted(() => {
  class FakeHowl {
    static instances: FakeHowl[] = [];
    src: string;
    html5: boolean;
    playingIds = new Set<number>();
    private nextId = 1;

    constructor(opts: { src: string[]; html5?: boolean }) {
      this.src = opts.src[0]!;
      this.html5 = opts.html5 ?? false;
      FakeHowl.instances.push(this);
    }

    play(id?: number): number {
      const soundId = id ?? this.nextId++;
      this.playingIds.add(soundId);
      return soundId;
    }

    pause(): void {
      this.playingIds.clear();
    }

    stop(): void {
      this.playingIds.clear();
    }

    unload(): void {}
    fade(): void {}
    volume(): this {
      return this;
    }
    playing(): boolean {
      return this.playingIds.size > 0;
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

vi.mock('howler', () => ({
  Howl: FakeHowl,
  Howler: { volume: () => {}, autoSuspend: true, ctx: { resume: () => Promise.resolve() } },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
}));

import { AudioDirector } from './AudioDirector';

describe('AudioDirector', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    FakeHowl.instances = [];
    nav.pathname = '/';
    resetAudioManagerForTests();
    resetMusicBindingsForTests();
    useAudioStore.setState({ channels: DEFAULT_SETTINGS, unlocked: false });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
    resetAudioManagerForTests();
    resetMusicBindingsForTests();
    vi.unstubAllGlobals();
  });

  it('starts the title theme on the first gesture, not a later effect', async () => {
    await act(async () => root.render(createElement(AudioDirector)));
    expect(FakeHowl.instances.some((howl) => howl.src.includes('music-title'))).toBe(false);

    act(() => window.dispatchEvent(new Event('pointerdown')));

    const theme = FakeHowl.instances.find((howl) => howl.src.includes('music-title.m4a'));
    expect(theme).toBeDefined();
    expect(theme?.playing()).toBe(true);
  });

  it('keeps the title theme playing when the shelf route replaces home', async () => {
    await act(async () => root.render(createElement(AudioDirector)));
    act(() => window.dispatchEvent(new Event('pointerdown')));
    const theme = FakeHowl.instances.find((howl) => howl.src.includes('music-title.m4a'));
    expect(theme?.playing()).toBe(true);

    nav.pathname = '/games';
    await act(async () => root.render(createElement(AudioDirector)));

    expect(theme?.playing()).toBe(true);
    expect(FakeHowl.instances.filter((howl) => howl.src.includes('music-title.m4a'))).toHaveLength(
      1,
    );
  });

  it('silences the title theme while hidden and resumes it on foreground', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    });
    resetAudioManagerForTests();
    resetMusicBindingsForTests();
    await act(async () => root.render(createElement(AudioDirector)));
    act(() => window.dispatchEvent(new Event('pointerdown')));
    const theme = FakeHowl.instances.find((howl) => howl.src.includes('music-title.m4a'));
    expect(theme?.playing()).toBe(true);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(theme?.playing()).toBe(false);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(theme?.playing()).toBe(true);
  });

  it('keeps the title theme playing when a fullscreen Mac app loses visibility', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    resetAudioManagerForTests();
    resetMusicBindingsForTests();
    await act(async () => root.render(createElement(AudioDirector)));
    act(() => window.dispatchEvent(new Event('pointerdown')));
    const theme = FakeHowl.instances.find((howl) => howl.src.includes('music-title.m4a'));
    expect(theme?.playing()).toBe(true);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(theme?.playing()).toBe(true);
  });
});
