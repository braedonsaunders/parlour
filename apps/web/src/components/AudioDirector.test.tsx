import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, resetAudioManagerForTests } from '@/lib/audio/AudioManager';
import { resetMusicBindingsForTests, useAudioStore } from '@/stores/audio';
import {
  activateMultiplayerSession,
  clearActiveMultiplayerSession,
  type MultiplayerRoomSession,
  type MultiplayerRoomSnapshot,
  type MultiplayerSeat,
} from '@/app/_multiplayer/roomSession';

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

function human(seat: number, name: string, connected = true): MultiplayerSeat {
  return {
    seat,
    name,
    avatarId: 'ember',
    profileId: `profile-${name}`,
    bot: false,
    connected,
  };
}

function roomHarness(initialSeats: readonly MultiplayerSeat[]) {
  const listeners = new Set<() => void>();
  let snapshot = {
    room: { code: 'ABCD', peerId: 'host', hostId: 'host' },
    connection: 'connected',
    seats: initialSeats,
  } as unknown as MultiplayerRoomSnapshot;
  const room = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: vi.fn(),
  } as unknown as MultiplayerRoomSession;
  return {
    room,
    seats(next: readonly MultiplayerSeat[]) {
      snapshot = { ...snapshot, seats: next };
      for (const listener of listeners) listener();
    },
  };
}

describe('AudioDirector', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    FakeHowl.instances = [];
    nav.pathname = '/';
    resetAudioManagerForTests();
    resetMusicBindingsForTests();
    clearActiveMultiplayerSession();
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
    clearActiveMultiplayerSession();
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

  it('chimes for human room arrivals and departures, but not the initial roster or bots', async () => {
    const host = human(0, 'Host');
    const guest = human(1, 'Guest');
    const bot = { ...human(1, 'Bot'), bot: true };
    const harness = roomHarness([host]);
    activateMultiplayerSession(harness.room);
    await act(async () => root.render(createElement(AudioDirector)));
    act(() => window.dispatchEvent(new Event('pointerdown')));

    expect(FakeHowl.instances.some((howl) => howl.src.includes('president-role-chime'))).toBe(
      false,
    );
    act(() => harness.seats([host, bot]));
    expect(FakeHowl.instances.some((howl) => howl.src.includes('president-role-chime'))).toBe(
      false,
    );

    act(() => harness.seats([host, guest]));
    expect(
      FakeHowl.instances.find((howl) => howl.src.includes('president-role-chime'))?.playing(),
    ).toBe(true);

    act(() => harness.seats([host]));
    expect(
      FakeHowl.instances.find((howl) => howl.src.includes('president-pass.mp3'))?.playing(),
    ).toBe(true);
  });

  /*
   * The games shelf is a row of tiles that are themselves buttons, so on iOS
   * every swipe along it starts by pressing one. Sounding on `pointerdown`
   * meant the shelf clicked at the player for the whole length of a scroll.
   */
  describe('the press sound follows a press, not a scroll', () => {
    function pointer(
      type: string,
      target: Element,
      { x = 0, y = 0, id = 1, pointerType = 'touch' } = {},
    ) {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
      Object.defineProperty(event, 'pointerId', { value: id });
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      act(() => void target.dispatchEvent(event));
    }

    const pressed = () =>
      FakeHowl.instances.some((howl) => howl.src.includes('ui-press.mp3') && howl.playing());

    let tile: HTMLButtonElement;

    beforeEach(async () => {
      tile = document.createElement('button');
      document.body.append(tile);
      await act(async () => root.render(createElement(AudioDirector)));
      // Audio has to be unlocked before anything can sound at all.
      act(() => window.dispatchEvent(new Event('pointerdown')));
      FakeHowl.instances = [];
    });

    afterEach(() => tile.remove());

    it('stays quiet while a finger drags a tile past the slop', () => {
      pointer('pointerdown', tile, { x: 100, y: 100 });
      expect(pressed()).toBe(false);
      pointer('pointerup', tile, { x: 220, y: 104 });
      expect(pressed()).toBe(false);
    });

    it('stays quiet when the browser takes the gesture for scrolling', () => {
      pointer('pointerdown', tile, { x: 100, y: 100 });
      pointer('pointercancel', tile, { x: 100, y: 100 });
      pointer('pointerup', tile, { x: 100, y: 100 });
      expect(pressed()).toBe(false);
    });

    it('sounds when a finger taps and lifts on the same control', () => {
      pointer('pointerdown', tile, { x: 100, y: 100 });
      expect(pressed()).toBe(false);
      pointer('pointerup', tile, { x: 102, y: 101 });
      expect(pressed()).toBe(true);
    });

    it('stays quiet when a finger lifts somewhere else', () => {
      const other = document.createElement('button');
      document.body.append(other);
      pointer('pointerdown', tile, { x: 100, y: 100 });
      pointer('pointerup', other, { x: 101, y: 100 });
      expect(pressed()).toBe(false);
      other.remove();
    });

    it('still sounds a mouse the instant it goes down, since a mouse cannot scroll', () => {
      pointer('pointerdown', tile, { x: 100, y: 100, pointerType: 'mouse' });
      expect(pressed()).toBe(true);
    });
  });
});
