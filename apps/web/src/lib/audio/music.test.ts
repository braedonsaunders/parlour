import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BASE_PACK_ID,
  FALLBACK_TRACK,
  MENU_PLAYLIST,
  MUSIC_TRACKS,
  PARLOUR_PACK,
  TENSE_PACK,
  getMusicPack,
  getMusicTrack,
  listMusicPacks,
  playlistForPack,
  registerMusicPack,
  tracksForScene,
  unregisterMusicPack,
} from './music';

const SCENE_IDS = ['campfire', 'casino', 'snug'] as const;

describe('music library', () => {
  it('ships exactly three songs per scene with unique ids and safe paths', () => {
    const ids = MUSIC_TRACKS.map((candidate) => candidate.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const scene of SCENE_IDS) {
      const playlist = tracksForScene(scene);
      expect(playlist, `${scene} ships three songs`).toHaveLength(3);
      for (const song of playlist) {
        expect(song.title.trim()).not.toBe('');
        expect(song.src).toBe(`/audio/music/music-${song.id}.mp3`);
      }
    }
  });

  it('keeps the built-in fallback ambience as a looping non-empty WAV', () => {
    const path = join(process.cwd(), 'public', FALLBACK_TRACK.src);
    expect(statSync(path).size).toBeGreaterThan(1_000);
    const header = readFileSync(path).subarray(0, 12);
    expect(header.subarray(0, 4).toString()).toBe('RIFF');
    expect(header.subarray(8, 12).toString()).toBe('WAVE');
    expect(getMusicTrack(FALLBACK_TRACK.id)).toBe(FALLBACK_TRACK);
    expect(FALLBACK_TRACK.loop).toBe(true);
  });

  it('resolves lookups across songs, packs, menu theme, and fallback', () => {
    expect(MUSIC_TRACKS.length).toBe(11);
    expect(getMusicTrack('campfire-1')?.title).toBe('Ember Watch');
    expect(getMusicTrack('title-1')?.src).toContain('music-title.mp3');
    expect(getMusicTrack('tense-1')?.src).toContain('music-tense.mp3');
    expect(getMusicTrack('nope')).toBeUndefined();
  });

  it('ships every declared track as a valid non-empty MP3', () => {
    expect(MUSIC_TRACKS.length).toBeGreaterThan(0);
    for (const song of MUSIC_TRACKS) {
      const path = join(process.cwd(), 'public', song.src);
      expect(statSync(path).size, `${song.id} is not an empty placeholder`).toBeGreaterThan(50_000);
      const header = readFileSync(path);
      const hasId3 = header.subarray(0, 3).toString() === 'ID3';
      const hasFrameSync = header[0] === 0xff && (header[1]! & 0xe0) === 0xe0;
      expect(hasId3 || hasFrameSync, `${song.id} is not an MPEG audio file`).toBe(true);
    }
  });

  it('provides a menu theme on the base pack and a built-in tense pack', () => {
    expect(PARLOUR_PACK.menu).toEqual(MENU_PLAYLIST);
    expect(menuPlaylistSrc()).toContain('/audio/music/music-title.mp3');
    expect(getMusicPack(TENSE_PACK.id)).toBe(TENSE_PACK);
    expect(listMusicPacks().map((pack) => pack.id)).toContain('tense');

    for (const scene of SCENE_IDS) {
      expect(playlistForPack(TENSE_PACK, scene)[0]?.src).toContain('music-tense.mp3');
    }
  });
});

function menuPlaylistSrc(): string {
  return MENU_PLAYLIST[0]?.src ?? '';
}

describe('music pack registry', () => {
  it('registers the parlour base pack and lists it first', () => {
    expect(getMusicPack(BASE_PACK_ID)).toBe(PARLOUR_PACK);
    expect(listMusicPacks()[0]?.id).toBe(BASE_PACK_ID);
    expect(getMusicPack('missing')).toBeUndefined();
  });

  it('lets games contribute their own playlists and removes them again', () => {
    registerMusicPack({
      id: 'test-game',
      label: 'Test Game',
      playlists: { snug: [getMusicTrack('campfire-1')!] },
    });

    const gamePack = getMusicPack('test-game');
    expect(gamePack).toBeDefined();
    expect(listMusicPacks().map((pack) => pack.id)).toContain('test-game');

    // A pack's own playlist wins; scenes it omits inherit the parlour library.
    expect(playlistForPack(gamePack, 'snug').map((song) => song.id)).toEqual(['campfire-1']);
    expect(playlistForPack(gamePack, 'casino')).toEqual(tracksForScene('casino'));

    unregisterMusicPack('test-game');
    expect(getMusicPack('test-game')).toBeUndefined();
  });

  it('never unregisters the parlour base pack', () => {
    unregisterMusicPack(BASE_PACK_ID);
    expect(getMusicPack(BASE_PACK_ID)).toBe(PARLOUR_PACK);
  });
});
