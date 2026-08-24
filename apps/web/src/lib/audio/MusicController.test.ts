import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { MUSIC_STORAGE_KEY, MusicController } from './MusicController';
import {
  FALLBACK_TRACK,
  getMusicTrack,
  registerMusicPack,
  tracksForScene,
  unregisterMusicPack,
} from './music';

function registerPackForTest(): void {
  registerMusicPack({
    id: 'test-game',
    label: 'Test Game',
    playlists: {
      snug: [{ id: 'wild-a', title: 'Chaos Waltz', src: '/audio/music/wild-a.mp3' }],
    },
  });
}

function unregisterPackForTest(): void {
  unregisterMusicPack('test-game');
}

const { FakeHowl } = vi.hoisted(() => {
  let nextSoundId = 1;
  class FakeHowl {
    static instances: FakeHowl[] = [];
    src: string;
    format: string[] | undefined;
    loop: boolean;
    playingIds = new Set<number>();
    handlers = new Map<string, Set<() => void>>();
    stopped = false;
    unloaded = false;

    constructor(opts: { src: string[]; format?: string[]; loop?: boolean }) {
      this.src = opts.src[0]!;
      this.format = opts.format;
      this.loop = opts.loop ?? false;
      FakeHowl.instances.push(this);
    }

    play(id?: number): number {
      const soundId = id ?? nextSoundId++;
      this.playingIds.add(soundId);
      return soundId;
    }

    pause(id?: number): void {
      if (id === undefined) this.playingIds.clear();
      else this.playingIds.delete(id);
    }

    stop(): void {
      this.stopped = true;
      this.playingIds.clear();
    }

    unload(): void {
      this.unloaded = true;
    }

    fade(): void {}

    volume(): number | this {
      return this;
    }

    seek(): number | this {
      return this;
    }

    once(event: string, handler: () => void): this {
      const set = this.handlers.get(event) ?? new Set();
      set.add(handler);
      this.handlers.set(event, set);
      return this;
    }

    emit(event: string): void {
      for (const handler of [...(this.handlers.get(event) ?? [])]) handler();
    }
  }
  return { FakeHowl };
});

vi.mock('howler', () => ({ Howl: FakeHowl }));

function makeManager(initialGain = 0.45) {
  let gain = initialGain;
  const listeners = new Set<(settings: unknown) => void>();
  return {
    gainFor: () => gain,
    subscribe(listener: (settings: unknown) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setGain(next: number) {
      gain = next;
      for (const listener of listeners) listener(null);
    },
  };
}

function howlFor(srcPart: string): InstanceType<typeof FakeHowl> | undefined {
  return FakeHowl.instances.find((howl) => howl.src.includes(srcPart));
}

beforeEach(() => {
  localStorage.clear();
  FakeHowl.instances.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MusicController', () => {
  it('starts idle on the parlour pack', () => {
    const controller = new MusicController(makeManager());
    expect(controller.getState()).toEqual({
      status: 'idle',
      trackId: null,
      shuffle: false,
      packId: 'parlour',
      mood: null,
    });
  });

  it('plays the active scene playlist as fresh non-looping songs', () => {
    const controller = new MusicController(makeManager());
    controller.setScene('casino');
    controller.play();

    expect(controller.getState().trackId).toBe('casino-1');
    expect(controller.getState().status).toBe('playing');
    expect(howlFor('music-casino-1.m4a')).toMatchObject({ format: ['m4a'], loop: false });

    controller.next();
    expect(controller.getState().trackId).toBe('casino-2');
  });

  it('advances automatically when a song ends and wraps the playlist', () => {
    const controller = new MusicController(makeManager());
    controller.play();
    expect(controller.getState().trackId).toBe('campfire-1');

    for (const expected of ['campfire-2', 'campfire-3', 'campfire-1']) {
      howlFor(`music-${controller.getState().trackId}.m4a`)?.emit('end');
      expect(controller.getState().trackId).toBe(expected);
    }
    expect(controller.getState().status).toBe('playing');
  });

  it('does not advance on song end while paused', () => {
    const controller = new MusicController(makeManager());
    controller.play();
    controller.pause();

    howlFor('music-campfire-1.m4a')?.emit('end');
    expect(controller.getState().trackId).toBe('campfire-1');
    expect(controller.getState().status).toBe('paused');
  });

  it('pauses and resumes the same voice on toggle', () => {
    const controller = new MusicController(makeManager());
    controller.play();
    controller.toggle();
    expect(controller.getState().status).toBe('paused');
    controller.toggle();
    expect(controller.getState().status).toBe('playing');
    expect(FakeHowl.instances).toHaveLength(1);
  });

  it('swaps playlists when the background changes mid-song', () => {
    const controller = new MusicController(makeManager());
    controller.play();
    const voiceCountBefore = FakeHowl.instances.length;

    controller.setScene('snug');

    expect(controller.getState().trackId).toBe('snug-1');
    expect(FakeHowl.instances.length).toBe(voiceCountBefore + 1);

    vi.advanceTimersByTime(1000);
    const retired = howlFor('music-campfire-1.m4a');
    expect(retired?.stopped || retired?.unloaded).toBe(true);
  });

  it('switches to the title theme in the menu and back at the table', () => {
    const controller = new MusicController(makeManager());
    controller.play();
    expect(controller.getState().trackId).toBe('campfire-1');

    controller.setMenu(true);
    expect(controller.getState().trackId).toBe('title-1');
    expect(howlFor('music-title.m4a')).toBeDefined();

    // Single-song playlist wraps on itself.
    howlFor('music-title.m4a')?.emit('end');
    expect(controller.getState().trackId).toBe('title-1');

    controller.setMenu(false);
    expect(controller.getState().trackId).toBe('campfire-1');
  });

  it('keeps menu context idle-safe but applies it on the next play', () => {
    const controller = new MusicController(makeManager());
    controller.setMenu(true);
    expect(controller.getState()).toMatchObject({ status: 'idle', trackId: null });

    controller.play();
    expect(controller.getState().trackId).toBe('title-1');
  });

  it('does not start game music from a background change while on a menu', () => {
    const controller = new MusicController(makeManager());
    controller.setMenu(true);
    controller.play();
    expect(controller.getState().trackId).toBe('title-1');

    controller.setScene('casino');
    expect(controller.getState().trackId).toBe('title-1');

    // The pick is armed: entering the table swaps straight into the casino set.
    controller.setMenu(false);
    expect(controller.getState().trackId).toBe('casino-1');
  });

  it('keeps tense out of the pack picker and arms it as a game-state mood', () => {
    const controller = new MusicController(makeManager());
    expect(controller.listPacks().map((pack) => pack.id)).not.toContain('tense');

    controller.setScene('casino');
    controller.play();
    controller.next();
    expect(controller.getState().trackId).toBe('casino-2');

    controller.setMood('tense');
    expect(controller.getState().mood).toBe('tense');
    expect(controller.getState().trackId).toBe('tense-casino');
    expect(controller.getState().status).toBe('playing');
    expect(howlFor('music-tense-casino.m4a')).toBeDefined();

    // The cue holds through playlist navigation, while scene changes select the
    // matching themed tense cue.
    controller.next();
    expect(controller.getState().trackId).toBe('tense-casino');
    controller.setScene('snug');
    expect(controller.getState().trackId).toBe('tense-snug');
    expect(howlFor('music-tense-snug.m4a')).toBeDefined();

    // Releasing it returns to the song the table was on before the cue.
    controller.setScene('casino');
    expect(controller.getState().trackId).toBe('tense-casino');
    controller.setMood(null);
    expect(controller.getState().mood).toBeNull();
    expect(controller.getState().trackId).toBe('casino-2');
  });

  it('falls back to the scene head when the pre-mood song is no longer available', () => {
    const controller = new MusicController(makeManager());
    controller.setScene('casino');
    controller.play();
    controller.next();
    controller.setMood('tense');

    controller.setScene('snug');
    controller.setMood(null);
    expect(controller.getState().trackId).toBe('snug-1');
  });

  it('ignores moods the active pack does not ship', () => {
    const controller = new MusicController(makeManager());
    controller.play();
    controller.setMood('sudden-death');
    expect(controller.getState()).toMatchObject({ mood: null, trackId: 'campfire-1' });
  });

  it('never persists a mood and keeps the menu theme through one', () => {
    const controller = new MusicController(makeManager());
    controller.play();
    controller.setMood('tense');
    expect(JSON.parse(localStorage.getItem(MUSIC_STORAGE_KEY) ?? '{}').trackId).toBe('campfire-1');

    controller.setMenu(true);
    expect(controller.getState().trackId).toBe('title-1');

    controller.setMenu(false);
    expect(controller.getState().trackId).toBe('tense-campfire');
  });

  it('arms a mood while idle and applies it on the next play', () => {
    const controller = new MusicController(makeManager());
    controller.setMood('tense');
    expect(controller.getState()).toMatchObject({ status: 'idle', mood: 'tense' });

    controller.play();
    expect(controller.getState().trackId).toBe('tense-campfire');
  });

  it('uses tense music authored by the active game pack', () => {
    const gameTense = {
      id: 'game-tense',
      title: 'Game Pressure',
      src: '/audio/music/game-tense.m4a',
      format: 'm4a',
    };
    registerMusicPack({
      id: 'tense-game',
      label: 'Tense Game',
      playlists: {},
      moods: { tense: [gameTense] },
    });

    const controller = new MusicController(makeManager());
    controller.setScene('casino');
    controller.setPack('tense-game');
    controller.play();
    controller.setMood('tense');

    expect(controller.getState()).toMatchObject({
      packId: 'tense-game',
      mood: 'tense',
      trackId: 'game-tense',
    });
    expect(howlFor('game-tense.m4a')).toMatchObject({ format: ['m4a'] });

    unregisterMusicPack('tense-game');
  });

  it('keeps a scene change idle-safe but applies it on the next play', () => {
    const controller = new MusicController(makeManager());
    controller.setScene('casino');
    expect(controller.getState()).toMatchObject({ status: 'idle', trackId: null });

    controller.play();
    expect(controller.getState().trackId).toBe('casino-1');
  });

  it('switches soundtrack packs and persists the choice', () => {
    const controller = new MusicController(makeManager());
    controller.setPack('unknown-pack');
    expect(controller.getState().packId).toBe('parlour');
    expect(controller.getState().trackId).toBeNull();

    registerPackForTest();
    controller.setScene('snug');
    controller.setPack('test-game');
    expect(controller.getState().packId).toBe('test-game');

    // Idle switch applies on the next play.
    controller.play();
    expect(controller.getState().trackId).toBe('wild-a');
    expect(howlFor('wild-a.mp3')).toMatchObject({ format: undefined });

    unregisterPackForTest();
    FakeHowl.instances.length = 0;
    // Persisted pack vanished from the registry → falls back to parlour.
    expect(new MusicController(makeManager()).getState().packId).toBe('parlour');
  });

  it('falls back to hearth ambience when every scene song fails to load', () => {
    const controller = new MusicController(makeManager());
    controller.play();

    howlFor('music-campfire-1.m4a')?.emit('loaderror');
    expect(controller.getState().trackId).toBe('campfire-2');
    howlFor('music-campfire-2.m4a')?.emit('loaderror');
    expect(controller.getState().trackId).toBe('campfire-3');
    howlFor('music-campfire-3.m4a')?.emit('loaderror');

    expect(controller.getState().trackId).toBe(FALLBACK_TRACK.id);
    expect(howlFor('parlour-ambience.wav')?.loop).toBe(true);
    expect(controller.getState().status).toBe('playing');
  });

  it('pauses when muted and resumes when unmuted', () => {
    const manager = makeManager(0.45);
    const controller = new MusicController(manager);
    controller.play();

    manager.setGain(0);
    expect(controller.getState().status).toBe('paused');

    manager.setGain(0.45);
    expect(controller.getState().status).toBe('playing');
  });

  it('shuffle always lands somewhere else in the playlist', () => {
    const controller = new MusicController(makeManager());
    controller.toggleShuffle();
    controller.setScene('casino');
    controller.play();

    for (let i = 0; i < 12; i += 1) {
      const before = controller.getState().trackId;
      controller.next();
      const state = controller.getState();
      expect(tracksForScene('casino').some((song) => song.id === state.trackId)).toBe(true);
      expect(state.trackId).not.toBe(before);
    }
  });

  it('previous() returns to the last played song without growing history', () => {
    const controller = new MusicController(makeManager());
    controller.play();
    controller.next();
    controller.previous();

    expect(controller.getState().trackId).toBe(getMusicTrack('campfire-1')!.id);
    expect(JSON.parse(localStorage.getItem(MUSIC_STORAGE_KEY)!).trackId).toBe('campfire-1');
  });
});
