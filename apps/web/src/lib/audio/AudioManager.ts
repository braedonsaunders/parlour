import { Howl, Howler } from 'howler';
import { isAppleTouchDevice } from '@/lib/audio/platform';

export const AUDIO_STORAGE_KEY = 'parlour.audio.v1';

type HowlerRuntime = {
  volume?: (value: number) => void;
  ctx?: {
    state?: string;
    resume?: () => Promise<void>;
    suspend?: () => Promise<void>;
  };
  autoSuspend?: boolean;
};

/** One-sample WAV that keeps the iOS audio session alive across SPA navigations. */
const SESSION_HOLD_SRC =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

function howlerRuntime(): HowlerRuntime {
  return Howler as unknown as HowlerRuntime;
}

export type AudioChannel = 'master' | 'music' | 'sfx';

export type ChannelState = {
  volume: number;
  muted: boolean;
};

export type AudioSettings = Record<AudioChannel, ChannelState>;

export type SoundDef = {
  id: string;
  src: string;
  channel: Exclude<AudioChannel, 'master'>;
  volume?: number;
  loop?: boolean;
  /** Max simultaneous voices for this id; further calls are dropped. */
  cap?: number;
  /** Minimum ms between two triggers of this id. */
  minInterval?: number;
};

export type PlayOptions = {
  volume?: number;
  rate?: number;
};

type Entry = {
  def: SoundDef;
  howl: Howl | null;
  failed: boolean;
  active: number;
  voices: Map<number, number>;
  lastPlayedAt: number;
};

const DEFAULT_CAP = 4;
const DEFAULT_MIN_INTERVAL = 40;

export const DEFAULT_SETTINGS: AudioSettings = {
  master: { volume: 0.9, muted: false },
  music: { volume: 0.45, muted: false },
  sfx: { volume: 1, muted: false },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeChannel(raw: unknown, fallback: ChannelState): ChannelState {
  if (typeof raw !== 'object' || raw === null) return { ...fallback };
  const candidate = raw as Partial<ChannelState>;
  return {
    volume: typeof candidate.volume === 'number' ? clamp01(candidate.volume) : fallback.volume,
    muted: typeof candidate.muted === 'boolean' ? candidate.muted : fallback.muted,
  };
}

export function parseSettings(raw: string | null): AudioSettings {
  if (!raw) return structuredCloneSettings(DEFAULT_SETTINGS);
  try {
    const parsed = JSON.parse(raw) as { channels?: Partial<AudioSettings> };
    const channels = parsed?.channels ?? {};
    return {
      master: normalizeChannel(channels.master, DEFAULT_SETTINGS.master),
      music: normalizeChannel(channels.music, DEFAULT_SETTINGS.music),
      sfx: normalizeChannel(channels.sfx, DEFAULT_SETTINGS.sfx),
    };
  } catch {
    return structuredCloneSettings(DEFAULT_SETTINGS);
  }
}

export function serializeSettings(settings: AudioSettings): string {
  return JSON.stringify({ v: 1, channels: settings });
}

function structuredCloneSettings(settings: AudioSettings): AudioSettings {
  return {
    master: { ...settings.master },
    music: { ...settings.music },
    sfx: { ...settings.sfx },
  };
}

export class AudioManager {
  private settings: AudioSettings = structuredCloneSettings(DEFAULT_SETTINGS);
  private entries = new Map<string, Entry>();
  private listeners = new Set<(settings: AudioSettings) => void>();
  private unlocked = false;
  private pageActive = typeof document === 'undefined' || document.visibilityState !== 'hidden';
  private gestureBound = false;
  private gestureHandler: (() => void) | null = null;
  private lifecycleHandlers: {
    visibilityChange: () => void;
    pageHide: () => void;
    pageShow: () => void;
  } | null = null;
  private pageActiveListeners = new Set<(active: boolean) => void>();
  private sessionHold: HTMLAudioElement | null = null;

  constructor() {
    this.settings = parseSettings(this.readStorage());
    this.applyMasterVolume();
    // Howler otherwise suspends the shared context after 30s of "silence",
    // which races unmute and iOS PWA route changes.
    howlerRuntime().autoSuspend = false;
  }

  getSettings(): AudioSettings {
    return structuredCloneSettings(this.settings);
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  isPageActive(): boolean {
    return this.pageActive;
  }

  subscribe(listener: (settings: AudioSettings) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribePageActive(listener: (active: boolean) => void): () => void {
    this.pageActiveListeners.add(listener);
    return () => {
      this.pageActiveListeners.delete(listener);
    };
  }

  setVolume(channel: AudioChannel, volume: number): void {
    this.settings[channel].volume = clamp01(volume);
    this.commit();
  }

  setMuted(channel: AudioChannel, muted: boolean): void {
    this.settings[channel].muted = muted;
    this.commit();
  }

  toggleMuted(channel: AudioChannel): void {
    this.setMuted(channel, !this.settings[channel].muted);
  }

  /** Effective 0..1 gain for a channel, folding in master. */
  gainFor(channel: Exclude<AudioChannel, 'master'>): number {
    const master = this.settings.master;
    const own = this.settings[channel];
    if (master.muted || own.muted) return 0;
    return clamp01(master.volume * own.volume);
  }

  preload(manifest: readonly SoundDef[]): void {
    for (const def of manifest) {
      if (!this.entries.has(def.id)) {
        this.entries.set(def.id, {
          def,
          howl: null,
          failed: false,
          active: 0,
          voices: new Map(),
          lastPlayedAt: Number.NEGATIVE_INFINITY,
        });
      }
    }
  }

  activeVoices(id: string): number {
    return this.entries.get(id)?.active ?? 0;
  }

  play(id: string, options: PlayOptions = {}): number | null {
    if (!this.pageActive) return null;
    const entry = this.entries.get(id);
    if (!entry || entry.failed) return null;

    const gain = this.gainFor(entry.def.channel);
    if (gain <= 0) return null;

    const cap = entry.def.cap ?? DEFAULT_CAP;
    if (entry.active >= cap) return null;

    const minInterval = entry.def.minInterval ?? DEFAULT_MIN_INTERVAL;
    const now = this.now();
    if (now - entry.lastPlayedAt < minInterval) return null;

    const howl = this.ensureHowl(entry);
    if (!howl) return null;

    entry.lastPlayedAt = now;
    entry.active += 1;

    const soundId = howl.play();
    const voiceScale = clamp01((entry.def.volume ?? 1) * (options.volume ?? 1));
    const voiceGain = clamp01(gain * voiceScale);
    entry.voices.set(soundId, voiceScale);
    howl.volume(voiceGain, soundId);
    if (options.rate !== undefined) howl.rate(options.rate, soundId);

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      entry.voices.delete(soundId);
      entry.active = entry.voices.size;
    };
    howl.once('end', release, soundId);
    howl.once('stop', release, soundId);
    howl.once('playerror', release, soundId);

    return soundId;
  }

  stop(id: string): void {
    const entry = this.entries.get(id);
    if (!entry?.howl) return;
    entry.howl.stop();
    entry.active = 0;
    entry.voices.clear();
  }

  stopAll(): void {
    for (const id of this.entries.keys()) this.stop(id);
  }

  /**
   * Arms persistent gesture + page-lifecycle listeners. The first gesture
   * unlocks autoplay; every later gesture resumes the context so iOS cannot
   * leave music dead after a mute toggle or a client-side navigation.
   */
  unlock(): void {
    if (this.gestureBound || typeof window === 'undefined') return;
    this.gestureBound = true;

    const onGesture = () => {
      this.unlocked = true;
      this.holdSession();
      void this.resumeContext();
      this.notify();
    };

    this.gestureHandler = onGesture;
    window.addEventListener('pointerdown', onGesture, { capture: true });
    window.addEventListener('touchstart', onGesture, { capture: true, passive: true });
    window.addEventListener('keydown', onGesture, { capture: true });
    this.watchPageLifecycle();
  }

  /** Resume the shared Howler context if the browser suspended it. */
  async resumeContext(): Promise<boolean> {
    if (!this.pageActive) return false;
    this.holdSession();
    const ctx = howlerRuntime().ctx;
    if (ctx && ctx.state !== 'running' && typeof ctx.resume === 'function') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }
    return !ctx || ctx.state === 'running' || ctx.state === undefined;
  }

  dispose(): void {
    if (typeof window !== 'undefined' && this.gestureHandler) {
      window.removeEventListener('pointerdown', this.gestureHandler, { capture: true });
      window.removeEventListener('touchstart', this.gestureHandler, { capture: true });
      window.removeEventListener('keydown', this.gestureHandler, { capture: true });
    }
    this.gestureHandler = null;
    this.gestureBound = false;
    this.unwatchPageLifecycle();
    this.sessionHold?.pause();
    this.sessionHold = null;
    this.listeners.clear();
    this.pageActiveListeners.clear();
  }

  private ensureHowl(entry: Entry): Howl | null {
    if (entry.howl) return entry.howl;
    try {
      const howl = new Howl({
        src: [entry.def.src],
        loop: entry.def.loop ?? false,
        preload: true,
        html5: false,
      });
      howl.once('loaderror', () => {
        entry.failed = true;
        entry.active = 0;
        entry.voices.clear();
      });
      entry.howl = howl;
      return howl;
    } catch {
      entry.failed = true;
      return null;
    }
  }

  private holdSession(): void {
    if (!this.pageActive || !isAppleTouchDevice() || typeof Audio === 'undefined') return;
    if (!this.sessionHold) {
      try {
        const hold = new Audio(SESSION_HOLD_SRC);
        hold.loop = true;
        hold.preload = 'auto';
        hold.volume = 0.01;
        hold.setAttribute('playsinline', 'true');
        this.sessionHold = hold;
      } catch {
        return;
      }
    }
    if (this.sessionHold.paused) {
      const play = this.sessionHold.play?.();
      if (play && typeof play.catch === 'function') void play.catch(() => undefined);
    }
  }

  private watchPageLifecycle(): void {
    if (this.lifecycleHandlers || typeof window === 'undefined') return;
    const visibilityChange = () => {
      this.setPageActive(document.visibilityState !== 'hidden');
    };
    const pageHide = () => this.setPageActive(false);
    const pageShow = () => this.setPageActive(document.visibilityState !== 'hidden');
    this.lifecycleHandlers = { visibilityChange, pageHide, pageShow };
    document.addEventListener('visibilitychange', visibilityChange);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', pageShow);
  }

  private unwatchPageLifecycle(): void {
    if (!this.lifecycleHandlers || typeof window === 'undefined') return;
    const { visibilityChange, pageHide, pageShow } = this.lifecycleHandlers;
    document.removeEventListener('visibilitychange', visibilityChange);
    window.removeEventListener('pagehide', pageHide);
    window.removeEventListener('pageshow', pageShow);
    this.lifecycleHandlers = null;
  }

  private setPageActive(active: boolean): void {
    if (active === this.pageActive) return;
    this.pageActive = active;
    if (!active) {
      this.stopAll();
      this.sessionHold?.pause();
      const ctx = howlerRuntime().ctx;
      if (ctx?.state === 'running' && typeof ctx.suspend === 'function') {
        void ctx.suspend().catch(() => undefined);
      }
      this.notifyPageActive(false);
      return;
    }

    void this.resumeContext().then(() => {
      this.notifyPageActive(true);
      if (this.unlocked) this.notify();
    });
  }

  private notifyPageActive(active: boolean): void {
    for (const listener of this.pageActiveListeners) listener(active);
  }

  private applyMasterVolume(): void {
    // Per-voice gain folds in master + channel so independent live channel
    // controls can update loops without double-applying the master volume.
    Howler.volume?.(1);
  }

  private applyActiveVolumes(): void {
    for (const entry of this.entries.values()) {
      if (!entry.howl) continue;
      const channelGain = this.gainFor(entry.def.channel);
      for (const [id, voiceScale] of entry.voices) {
        entry.howl.volume(clamp01(channelGain * voiceScale), id);
      }
    }
  }

  private commit(): void {
    this.applyMasterVolume();
    this.applyActiveVolumes();
    this.writeStorage();
    this.notify();
  }

  private notify(): void {
    const snapshot = this.getSettings();
    for (const listener of this.listeners) listener(snapshot);
  }

  private now(): number {
    return Date.now();
  }

  private readStorage(): string | null {
    try {
      return globalThis.localStorage?.getItem(AUDIO_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private writeStorage(): void {
    try {
      globalThis.localStorage?.setItem(AUDIO_STORAGE_KEY, serializeSettings(this.settings));
    } catch {
      /* storage unavailable (private mode / SSR) — settings stay in memory */
    }
  }
}

let instance: AudioManager | null = null;

export function getAudioManager(): AudioManager {
  if (!instance) instance = new AudioManager();
  return instance;
}

export function resetAudioManagerForTests(): void {
  instance?.dispose();
  instance = null;
}
