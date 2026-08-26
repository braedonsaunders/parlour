import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { FakeHowl, howlerVolume } = vi.hoisted(() => {
  type Handler = () => void;

  class Fake {
    static instances: Fake[] = [];

    private handlers = new Map<string, Handler[]>();
    private nextId = 1;

    readonly volumeCalls: Array<[number, number]> = [];
    readonly rateCalls: Array<[number, number]> = [];
    stopped = 0;

    constructor(public readonly options: { src: string[]; loop?: boolean }) {
      Fake.instances.push(this);
    }

    play(): number {
      return this.nextId++;
    }

    volume(value: number, id: number): void {
      this.volumeCalls.push([value, id]);
    }

    rate(value: number, id: number): void {
      this.rateCalls.push([value, id]);
    }

    stop(): void {
      this.stopped += 1;
    }

    once(event: string, callback: Handler, id?: number): void {
      const key = `${event}:${id ?? '*'}`;
      const list = this.handlers.get(key) ?? [];
      list.push(callback);
      this.handlers.set(key, list);
    }

    emit(event: string, id?: number): void {
      const key = `${event}:${id ?? '*'}`;
      const list = this.handlers.get(key) ?? [];
      this.handlers.set(key, []);
      for (const handler of list) handler();
    }
  }

  return { FakeHowl: Fake, howlerVolume: vi.fn() };
});

type FakeHowl = InstanceType<typeof FakeHowl>;

vi.mock('howler', () => ({
  Howl: FakeHowl,
  Howler: {
    volume: (value: number) => howlerVolume(value),
    autoSuspend: true,
    ctx: { state: 'running', resume: vi.fn(() => Promise.resolve()) },
  },
}));

import { Howler } from 'howler';
import {
  AudioManager,
  AUDIO_STORAGE_KEY,
  DEFAULT_SETTINGS,
  parseSettings,
  serializeSettings,
  type SoundDef,
} from './AudioManager';

const MANIFEST: readonly SoundDef[] = [
  { id: 'pop', src: '/audio/pop.mp3', channel: 'sfx', cap: 2, minInterval: 0 },
  { id: 'thud', src: '/audio/thud.mp3', channel: 'sfx', cap: 1, minInterval: 500 },
  { id: 'loop', src: '/audio/loop.mp3', channel: 'music', loop: true, cap: 1, minInterval: 0 },
];

function makeManager() {
  const manager = new AudioManager();
  manager.preload(MANIFEST);
  return manager;
}

function installMemoryStorage(): Storage {
  const map = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value)),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  return storage;
}

let localStorage: Storage;

beforeEach(() => {
  localStorage = installMemoryStorage();
  FakeHowl.instances = [];
  howlerVolume.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-23T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('settings persistence', () => {
  it('starts from defaults when storage is empty', () => {
    expect(makeManager().getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('writes a versioned channel payload under the v1 key', () => {
    const manager = makeManager();
    manager.setMuted('music', true);
    manager.setVolume('sfx', 0.5);

    const raw = localStorage.getItem(AUDIO_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({
      v: 1,
      channels: {
        master: DEFAULT_SETTINGS.master,
        music: { volume: DEFAULT_SETTINGS.music.volume, muted: true },
        sfx: { volume: 0.5, muted: false },
      },
    });
  });

  it('rehydrates mutes from storage on construction', () => {
    localStorage.setItem(
      AUDIO_STORAGE_KEY,
      serializeSettings({
        master: { volume: 0.8, muted: false },
        music: { volume: 0.2, muted: true },
        sfx: { volume: 0.7, muted: false },
      }),
    );

    const settings = makeManager().getSettings();
    expect(settings.music.muted).toBe(true);
    expect(settings.sfx.volume).toBe(0.7);
  });

  it('falls back to defaults on corrupt or partial payloads', () => {
    expect(parseSettings('not json at all')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ v: 1, channels: { sfx: { muted: true } } }))).toEqual({
      ...DEFAULT_SETTINGS,
      sfx: { volume: DEFAULT_SETTINGS.sfx.volume, muted: true },
    });
  });

  it('clamps volumes into 0..1', () => {
    const manager = makeManager();
    manager.setVolume('master', 4);
    manager.setVolume('sfx', -2);
    expect(manager.getSettings().master.volume).toBe(1);
    expect(manager.getSettings().sfx.volume).toBe(0);
  });

  it('folds master mute into channel gain', () => {
    const manager = makeManager();
    expect(manager.gainFor('sfx')).toBeGreaterThan(0);
    manager.setMuted('master', true);
    expect(manager.gainFor('sfx')).toBe(0);
    expect(manager.gainFor('music')).toBe(0);
  });

  it('applies channel mute changes to an already-playing music loop', () => {
    const manager = makeManager();
    manager.play('loop');
    const howl = FakeHowl.instances[0] as FakeHowl;

    manager.setMuted('music', true);
    expect(howl.volumeCalls.at(-1)).toEqual([0, 1]);

    manager.setMuted('music', false);
    expect(howl.volumeCalls.at(-1)?.[0]).toBeCloseTo(
      DEFAULT_SETTINGS.master.volume * DEFAULT_SETTINGS.music.volume,
    );
  });
});

describe('voice concurrency', () => {
  it('counts active voices up to the per-id cap and drops the overflow', () => {
    const manager = makeManager();

    expect(manager.play('pop')).not.toBeNull();
    expect(manager.play('pop')).not.toBeNull();
    expect(manager.activeVoices('pop')).toBe(2);

    expect(manager.play('pop')).toBeNull();
    expect(manager.activeVoices('pop')).toBe(2);
  });

  it('frees a voice slot when a sound ends', () => {
    const manager = makeManager();
    manager.play('pop');
    manager.play('pop');

    const howl = FakeHowl.instances[0] as FakeHowl;
    howl.emit('end', 1);
    expect(manager.activeVoices('pop')).toBe(1);

    expect(manager.play('pop')).not.toBeNull();
    expect(manager.activeVoices('pop')).toBe(2);
  });

  it('enforces the per-id minimum interval', () => {
    const manager = makeManager();
    expect(manager.play('thud')).not.toBeNull();

    const howl = FakeHowl.instances[0] as FakeHowl;
    howl.emit('end', 1);
    expect(manager.play('thud')).toBeNull();

    vi.advanceTimersByTime(600);
    expect(manager.play('thud')).not.toBeNull();
  });

  it('drops playback while the owning channel is muted', () => {
    const manager = makeManager();
    manager.setMuted('sfx', true);
    expect(manager.play('pop')).toBeNull();
    expect(manager.activeVoices('pop')).toBe(0);
  });

  it('ignores unknown ids and resets voices when an asset fails to load', () => {
    const manager = makeManager();
    expect(manager.play('nope')).toBeNull();

    manager.play('loop');
    const howl = FakeHowl.instances[0] as FakeHowl;
    expect(howl.options.loop).toBe(true);

    howl.emit('loaderror');
    expect(manager.activeVoices('loop')).toBe(0);
    expect(manager.play('loop')).toBeNull();
  });

  it('applies channel gain and rate to each voice', () => {
    const manager = makeManager();
    manager.setVolume('master', 0.5);
    manager.setVolume('sfx', 0.5);
    manager.play('pop', { volume: 0.5, rate: 1.2 });

    const howl = FakeHowl.instances[0] as FakeHowl;
    expect(howl.volumeCalls[0]?.[0]).toBeCloseTo(0.125);
    expect(howl.rateCalls[0]?.[0]).toBe(1.2);
  });
});

describe('unlock', () => {
  it('unlocks on the first user gesture and keeps resuming afterwards', async () => {
    const resume = vi.fn(() => Promise.resolve());
    (
      Howler as { autoSuspend?: boolean; ctx?: { state: string; resume: () => Promise<void> } }
    ).ctx = {
      state: 'suspended',
      resume,
    };

    const manager = makeManager();
    expect(Howler.autoSuspend).toBe(false);
    expect(manager.isUnlocked()).toBe(false);

    manager.unlock();
    window.dispatchEvent(new Event('pointerdown'));
    expect(manager.isUnlocked()).toBe(true);
    await Promise.resolve();
    expect(resume).toHaveBeenCalledTimes(1);

    (Howler as { ctx?: { state: string; resume: () => Promise<void> } }).ctx = {
      state: 'suspended',
      resume,
    };
    window.dispatchEvent(new Event('keydown'));
    await Promise.resolve();
    expect(resume).toHaveBeenCalledTimes(2);
    manager.dispose();
  });

  it('holds a silent audio session on iOS only while the page is active', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });
    const play = vi.fn(function (this: { paused: boolean }) {
      this.paused = false;
      return Promise.resolve();
    });
    const pause = vi.fn(function (this: { paused: boolean }) {
      this.paused = true;
    });
    vi.stubGlobal(
      'Audio',
      class {
        loop = false;
        preload = '';
        volume = 1;
        paused = true;
        play = play;
        pause = pause;
        setAttribute = vi.fn();
      },
    );

    const manager = makeManager();
    manager.unlock();
    window.dispatchEvent(new Event('pointerdown'));
    expect(play).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('pagehide'));
    expect(pause).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('pageshow'));
    await Promise.resolve();
    expect(play).toHaveBeenCalledTimes(2);

    manager.dispose();
    vi.unstubAllGlobals();
  });

  it('stops and blocks sounds while hidden, then resumes the Web Audio context', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    });
    const context = {
      state: 'running',
      suspend: vi.fn(async () => {
        context.state = 'suspended';
      }),
      resume: vi.fn(async () => {
        context.state = 'running';
      }),
    };
    (Howler as unknown as { ctx: typeof context }).ctx = context;
    const manager = makeManager();
    const activeStates: boolean[] = [];
    manager.subscribePageActive((active) => activeStates.push(active));
    manager.unlock();
    expect(manager.play('pop')).not.toBeNull();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(manager.isPageActive()).toBe(false);
    expect(manager.activeVoices('pop')).toBe(0);
    expect(manager.play('pop')).toBeNull();
    expect(context.suspend).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    await Promise.resolve();
    expect(manager.isPageActive()).toBe(true);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(activeStates).toEqual([false, true]);
    manager.dispose();
  });

  it('keeps desktop audio active when a fullscreen Mac app loses visibility', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    const context = {
      state: 'running',
      suspend: vi.fn(() => Promise.resolve()),
      resume: vi.fn(() => Promise.resolve()),
    };
    (Howler as unknown as { ctx: typeof context }).ctx = context;
    const manager = makeManager();
    manager.unlock();
    expect(manager.play('pop')).not.toBeNull();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));

    expect(manager.isPageActive()).toBe(true);
    expect(manager.activeVoices('pop')).toBe(1);
    expect(manager.play('pop')).not.toBeNull();
    expect(context.suspend).not.toHaveBeenCalled();
    manager.dispose();
  });
});
