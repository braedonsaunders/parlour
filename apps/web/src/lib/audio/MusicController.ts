import { Howl } from 'howler';
import type { SceneId } from '@/stores/scene';
import { DEFAULT_SCENE } from '@/stores/scene';
import {
  BASE_PACK_ID,
  FALLBACK_TRACK,
  getMusicPack,
  getMusicTrack,
  listMusicPacks,
  menuForPack,
  moodForPack,
  playlistForPack,
  type MusicMoodId,
  type MusicTrack,
} from '@/lib/audio/music';
import { getAudioManager } from '@/lib/audio/AudioManager';

export const MUSIC_STORAGE_KEY = 'parlour.music.v1';

export type MusicStatus = 'idle' | 'playing' | 'paused';

export type MusicState = {
  status: MusicStatus;
  trackId: string | null;
  shuffle: boolean;
  packId: string;
  /** Active game-state cue (e.g. `tense`), or null when the scene plays. */
  mood: MusicMoodId | null;
};

export type MusicManagerPort = {
  gainFor(channel: 'music' | 'sfx'): number;
  subscribe(listener: (settings: unknown) => void): () => void;
};

type Voice = {
  howl: Howl;
  soundId: number | null;
  gain: number;
  failed: boolean;
};

const FADE_MS = 900;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Playlist player for the scene soundtracks. Each background has its own set of
 * full-length songs; the playlist cycles forever while individual songs play
 * through and hand off to the next one.
 */
export class MusicController {
  private manager: MusicManagerPort;
  private state: MusicState = {
    status: 'idle',
    trackId: null,
    shuffle: false,
    packId: BASE_PACK_ID,
    mood: null,
  };
  private listeners = new Set<(state: MusicState) => void>();
  private voices = new Map<string, Voice>();
  private wantPlaying = false;
  private pausedByMute = false;
  private history: string[] = [];
  private scene: SceneId = DEFAULT_SCENE;
  private inMenu = false;
  private transitionGeneration = 0;
  /** Song the scene playlist was on when a mood took over, restored on release. */
  private preMoodTrackId: string | null = null;

  constructor(manager: MusicManagerPort) {
    this.manager = manager;
    this.restore();
    this.manager.subscribe(() => this.syncGain());
  }

  getState(): MusicState {
    return { ...this.state };
  }

  subscribe(listener: (state: MusicState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Starts the active scene's playlist unless the user paused. */
  autoStart(): void {
    if (this.state.status !== 'idle') return;
    this.play();
  }

  play(trackId?: string): void {
    if (trackId) {
      this.start(trackId, true);
      return;
    }
    const list = this.playablePlaylist();
    const resumeIndex = this.state.trackId
      ? list.findIndex((track) => track.id === this.state.trackId)
      : -1;
    this.start((list[resumeIndex] ?? list[0] ?? FALLBACK_TRACK).id, true);
  }

  pause(): void {
    this.wantPlaying = false;
    this.pausedByMute = false;
    for (const voice of this.voices.values()) voice.howl.pause();
    this.state.status = 'paused';
    this.notify();
  }

  toggle(): void {
    if (this.state.status === 'playing') this.pause();
    else this.play();
  }

  next(): void {
    const list = this.playablePlaylist();
    if (list.length === 0) return;

    let target = list[0]!.id;
    if (this.state.shuffle && list.length > 1) {
      let guard = 0;
      do {
        target = list[Math.floor(Math.random() * list.length)]!.id;
        guard += 1;
      } while (target === this.state.trackId && guard < 32);
    } else {
      const index = list.findIndex((track) => track.id === this.state.trackId);
      target = (list[(index + 1) % list.length] ?? list[0])!.id;
    }
    this.start(target, true);
  }

  previous(): void {
    const last = this.history.pop();
    if (last && !this.voices.get(last)?.failed) {
      this.start(last, false);
      return;
    }
    const voice = this.state.trackId ? this.voices.get(this.state.trackId) : undefined;
    if (voice && voice.soundId !== null) {
      voice.howl.seek(0, voice.soundId);
      if (this.state.status !== 'playing') this.play();
    } else {
      this.play();
    }
  }

  toggleShuffle(): void {
    this.state.shuffle = !this.state.shuffle;
    this.persist();
    this.notify();
  }

  /** Background changes swap playlists at the table; on menus they only arm the pick. */
  setScene(scene: SceneId): void {
    if (scene === this.scene) return;
    this.scene = scene;
    this.history = [];
    if (this.inMenu || !this.wantPlaying || this.state.status === 'idle') return;

    const head = this.playablePlaylist()[0];
    if (!head || head.id === this.state.trackId) return;
    this.start(head.id, false);
  }

  /** Soundtrack packs let games ship their own music; null resets to parlour. */
  setPack(packId: string | null): void {
    const resolved = getMusicPack(packId)?.id ?? BASE_PACK_ID;
    if (resolved === this.state.packId) return;
    this.state.packId = resolved;
    this.history = [];
    if (!this.wantPlaying || this.state.status === 'idle') {
      this.persist();
      this.notify();
      return;
    }
    const head = this.playablePlaylist()[0];
    if (head && head.id !== this.state.trackId) this.start(head.id, false);
    else {
      this.persist();
      this.notify();
    }
  }

  /**
   * Game-state cues: `setMood('tense')` takes the table over with the mood's
   * tracks, `setMood(null)` crossfades back to the song the scene was on. Any
   * game can drive this from whatever its state implies — a match clock, a
   * knock, a last card — and moods the active pack does not ship are ignored.
   * Menus always keep their title theme, and moods are never persisted.
   */
  setMood(mood: MusicMoodId | null): void {
    const resolved =
      mood && moodForPack(getMusicPack(this.state.packId), mood, this.scene).length > 0
        ? mood
        : null;
    if (resolved === this.state.mood) return;

    const entering = resolved !== null;
    const resumeId = entering ? null : this.preMoodTrackId;
    this.preMoodTrackId = entering ? this.state.trackId : null;
    this.state.mood = resolved;
    this.history = [];

    if (this.inMenu || !this.wantPlaying || this.state.status === 'idle') {
      this.notify();
      return;
    }

    const list = this.playablePlaylist();
    const target = list.find((track) => track.id === resumeId) ?? list[0];
    if (!target || target.id === this.state.trackId) {
      this.notify();
      return;
    }
    this.start(target.id, false);
  }

  /** Menu routes swap to the pack's title theme; table routes use scene playlists. */
  setMenu(active: boolean): void {
    if (active === this.inMenu) return;
    this.inMenu = active;
    this.history = [];
    if (!this.wantPlaying || this.state.status === 'idle') return;

    const head = this.playablePlaylist()[0];
    if (!head || head.id === this.state.trackId) return;
    this.start(head.id, false);
  }

  listPacks() {
    return listMusicPacks();
  }

  dispose(): void {
    this.transitionGeneration += 1;
    this.wantPlaying = false;
    for (const voice of this.voices.values()) {
      voice.howl.stop();
      voice.howl.unload();
    }
    this.voices.clear();
    this.state.status = 'idle';
    this.state.mood = null;
    this.preMoodTrackId = null;
    this.notify();
  }

  private playablePlaylist() {
    const pack = getMusicPack(this.state.packId);
    const moodPool =
      !this.inMenu && this.state.mood
        ? moodForPack(pack, this.state.mood, this.scene)
        : ([] as MusicTrack[]);
    const mood = moodPool.filter((track) => !this.voices.get(track.id)?.failed);
    if (mood.length > 0) return mood;

    const pool = this.inMenu ? menuForPack(pack) : playlistForPack(pack, this.scene);
    const list = pool.filter((track) => !this.voices.get(track.id)?.failed);
    if (list.length > 0) return list;
    const fallbackFailed = this.voices.get(FALLBACK_TRACK.id)?.failed;
    return fallbackFailed ? [] : [FALLBACK_TRACK];
  }

  private gainFor(trackId: string): number {
    const track = getMusicTrack(trackId);
    return clamp01(this.manager.gainFor('music') * (track?.volume ?? 1));
  }

  private start(trackId: string, rememberPrevious: boolean): void {
    const track = getMusicTrack(trackId);
    if (!track) return;
    if (this.voices.get(trackId)?.failed) {
      if (trackId === this.state.trackId) return;
      this.next();
      return;
    }

    if (rememberPrevious && this.state.trackId && this.state.trackId !== trackId) {
      this.history.push(this.state.trackId);
      if (this.history.length > 16) this.history.shift();
    }
    this.state.trackId = trackId;
    this.wantPlaying = true;
    this.pausedByMute = false;

    this.startVoice(track, trackId);
    const mutedOut = this.gainFor(trackId) <= 0;
    if (mutedOut) {
      this.pausedByMute = true;
      for (const voice of this.voices.values()) voice.howl.pause();
    }
    this.state.status = mutedOut ? 'paused' : 'playing';
    this.persist();
    this.notify();
  }

  private startVoice(
    track: { src: string; format?: string; loop?: boolean; title: string },
    trackId: string,
  ): void {
    const generation = ++this.transitionGeneration;

    for (const [id, voice] of this.voices) {
      if (id === trackId) continue;
      if (voice.soundId !== null) {
        voice.howl.fade(voice.gain, 0, FADE_MS, voice.soundId);
      }
      window.setTimeout(() => {
        if (generation !== this.transitionGeneration) return;
        voice.howl.stop();
        voice.howl.unload();
        this.voices.delete(id);
      }, FADE_MS + 50);
    }

    const existing = this.voices.get(trackId);
    if (existing) {
      const soundId = existing.howl.play(existing.soundId ?? undefined);
      existing.soundId = soundId;
      existing.gain = this.gainFor(trackId);
      existing.howl.volume(0, soundId);
      existing.howl.fade(0, existing.gain, FADE_MS, soundId);
      return;
    }

    const voice: Voice = {
      howl: new Howl({
        src: [track.src],
        ...(track.format ? { format: [track.format] } : {}),
        loop: track.loop ?? false,
        html5: false,
        volume: 0,
      }),
      soundId: null,
      gain: 0,
      failed: false,
    };
    this.voices.set(trackId, voice);
    voice.howl.once('loaderror', () => {
      voice.failed = true;
      if (generation !== this.transitionGeneration || !this.wantPlaying) return;
      if (this.state.trackId === trackId) this.next();
    });
    voice.howl.once('playerror', () => {
      voice.failed = true;
    });
    voice.howl.once('end', () => {
      if (generation !== this.transitionGeneration) return;
      if (!this.wantPlaying || this.state.status !== 'playing') return;
      if (this.state.trackId === trackId) this.next();
    });

    const soundId = voice.howl.play();
    voice.soundId = soundId;
    voice.gain = this.gainFor(trackId);
    voice.howl.fade(0, voice.gain, FADE_MS, soundId);
  }

  private syncGain(): void {
    const gain = this.gainFor(this.state.trackId ?? '');
    const mutedOut = gain <= 0;

    if (mutedOut && this.state.status === 'playing') {
      this.pausedByMute = true;
      this.state.status = 'paused';
      for (const voice of this.voices.values()) voice.howl.pause();
      this.notify();
      return;
    }

    const voice = this.state.trackId ? this.voices.get(this.state.trackId) : undefined;
    if (!mutedOut && this.pausedByMute && this.wantPlaying && voice && !voice.failed) {
      this.pausedByMute = false;
      this.state.status = 'playing';
      if (voice.soundId !== null) {
        voice.howl.play(voice.soundId);
        voice.howl.fade(0, gain, FADE_MS, voice.soundId);
      }
      this.notify();
      return;
    }

    if (voice && voice.soundId !== null) {
      voice.gain = gain;
      voice.howl.volume(gain, voice.soundId);
    }
  }

  private restore(): void {
    try {
      const raw = globalThis.localStorage?.getItem(MUSIC_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        trackId?: unknown;
        shuffle?: unknown;
        packId?: unknown;
      };
      if (typeof parsed.shuffle === 'boolean') this.state.shuffle = parsed.shuffle;
      if (typeof parsed.packId === 'string' && getMusicPack(parsed.packId)) {
        this.state.packId = parsed.packId;
      }
      if (typeof parsed.trackId === 'string' && getMusicTrack(parsed.trackId)) {
        this.state.trackId = parsed.trackId;
      }
    } catch {
      /* corrupted or unavailable storage — fall back to defaults */
    }
  }

  private persist(): void {
    try {
      globalThis.localStorage?.setItem(
        MUSIC_STORAGE_KEY,
        JSON.stringify({
          v: 1,
          // Moods are transient: remember the scene song they interrupted.
          trackId: this.state.mood ? this.preMoodTrackId : this.state.trackId,
          shuffle: this.state.shuffle,
          packId: this.state.packId,
        }),
      );
    } catch {
      /* storage unavailable (private mode / SSR) — state stays in memory */
    }
  }

  private notify(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }
}

let instance: MusicController | null = null;

export function getMusicController(manager?: MusicManagerPort): MusicController {
  if (!instance) instance = new MusicController(manager ?? getAudioManager());
  return instance;
}

export function resetMusicControllerForTests(): void {
  instance?.dispose();
  instance = null;
}
