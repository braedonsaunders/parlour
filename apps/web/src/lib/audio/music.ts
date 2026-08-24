import type { SceneId } from '@/stores/scene';

/**
 * A soundtrack pack: named set of playlists any game can ship. The built-in
 * `parlour` pack covers every background scene; game modules register extra
 * packs via `registerMusicPack` and the app plays them per scene.
 */
export type MusicPack = {
  id: string;
  label: string;
  /** Playlist per background scene; missing scenes fall back to the parlour pack. */
  playlists: Partial<Record<SceneId, readonly MusicTrack[]>>;
  /** Title-screen theme; packs without one inherit the parlour menu theme. */
  menu?: readonly MusicTrack[];
};

export type MusicTrack = {
  id: string;
  title: string;
  src: string;
  /** Per-track scale inside the music channel gain. */
  volume?: number;
  /** Ambience-style tracks repeat themselves; songs advance the playlist instead. */
  loop?: boolean;
};

function track(id: string, title: string, src: string, volume?: number): MusicTrack {
  return { id, title, src, ...(volume === undefined ? {} : { volume }) };
}

const CAMPFIRE_PLAYLIST: readonly MusicTrack[] = [
  track('campfire-1', 'Ember Watch', '/audio/music/music-campfire-1.mp3'),
  track('campfire-2', 'Crickets & Coals', '/audio/music/music-campfire-2.mp3', 0.95),
  track('campfire-3', 'Smoke Signals', '/audio/music/music-campfire-3.mp3'),
];

const CASINO_PLAYLIST: readonly MusicTrack[] = [
  track('casino-1', 'Velvet Hour', '/audio/music/music-casino-1.mp3'),
  track('casino-2', 'Midnight Chip Lead', '/audio/music/music-casino-2.mp3', 0.95),
  track('casino-3', 'House Whiskey', '/audio/music/music-casino-3.mp3'),
];

const SNUG_PLAYLIST: readonly MusicTrack[] = [
  track('snug-1', 'Turf & Timber', '/audio/music/music-snug-1.mp3'),
  track('snug-2', 'Last Bus Home', '/audio/music/music-snug-2.mp3', 0.95),
  track('snug-3', 'The Quiet Round', '/audio/music/music-snug-3.mp3'),
];

/** Title-screen theme, played on menu routes instead of a scene playlist. */
export const MENU_PLAYLIST: readonly MusicTrack[] = [
  track('title-1', 'Pull Up a Chair', '/audio/music/music-title.mp3'),
];

/** Tense table moments — pickable as its own soundtrack and usable by games. */
const TENSE_PLAYLIST: readonly MusicTrack[] = [
  track('tense-1', 'Knock Knows', '/audio/music/music-tense.mp3'),
];

/** Flat view of every shipped track — handy for validation and tooling. */
export const MUSIC_TRACKS: readonly MusicTrack[] = [
  ...CAMPFIRE_PLAYLIST,
  ...CASINO_PLAYLIST,
  ...SNUG_PLAYLIST,
  ...MENU_PLAYLIST,
  ...TENSE_PLAYLIST,
];

export const BASE_PACK_ID = 'parlour';

export const PARLOUR_PACK: MusicPack = {
  id: BASE_PACK_ID,
  label: 'Parlour',
  playlists: {
    campfire: CAMPFIRE_PLAYLIST,
    casino: CASINO_PLAYLIST,
    snug: SNUG_PLAYLIST,
  },
};

/** Plays when a playlist has no working songs (e.g. before Suno files land). */
export const FALLBACK_TRACK: MusicTrack = {
  id: 'hearth',
  title: 'Hearth Ambience',
  src: '/audio/parlour-ambience.wav',
  volume: 0.6,
  loop: true,
};

const packs = new Map<string, MusicPack>([[PARLOUR_PACK.id, PARLOUR_PACK]]);

/** Games call this (client-side) to contribute their own soundtracks. */
export function registerMusicPack(pack: MusicPack): void {
  packs.set(pack.id, pack);
}

export function unregisterMusicPack(id: string): void {
  if (id !== PARLOUR_PACK.id) packs.delete(id);
}

export function getMusicPack(id: string | null | undefined): MusicPack | undefined {
  return packs.get(id ?? '');
}

export function listMusicPacks(): MusicPack[] {
  const rest = [...packs.values()].filter((pack) => pack.id !== PARLOUR_PACK.id);
  return [PARLOUR_PACK, ...rest];
}

export function getMusicTrack(id: string | null | undefined): MusicTrack | undefined {
  if (id === FALLBACK_TRACK.id) return FALLBACK_TRACK;
  const base = MUSIC_TRACKS.find((candidate) => candidate.id === id);
  if (base) return base;
  for (const pack of packs.values()) {
    for (const list of Object.values(pack.playlists)) {
      const found = list?.find((candidate) => candidate.id === id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Base-library playlist for a scene (what the parlour pack ships). */
export function tracksForScene(scene: SceneId): MusicTrack[] {
  const fromPack = PARLOUR_PACK.playlists[scene];
  return fromPack ? [...fromPack] : [];
}

/** Every playlist a pack provides for a scene, resolved against the parlour base. */
export function playlistForPack(pack: MusicPack | undefined, scene: SceneId): MusicTrack[] {
  const own = pack?.playlists[scene];
  if (own && own.length > 0) return [...own];
  return tracksForScene(scene);
}
