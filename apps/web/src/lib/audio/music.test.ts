import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BASE_PACK_ID,
  FALLBACK_TRACK,
  MENU_PLAYLIST,
  MUSIC_TRACKS,
  PARLOUR_PACK,
  TENSE_PLAYLISTS,
  getMusicPack,
  getMusicTrack,
  listMusicPacks,
  moodForPack,
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
        expect(song.src).toBe(`/audio/music/music-${song.id}.m4a`);
        expect(song.format).toBe('m4a');
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
    expect(MUSIC_TRACKS.length).toBe(13);
    expect(getMusicTrack('campfire-1')?.title).toBe('Ember Watch');
    expect(getMusicTrack('title-1')?.src).toContain('music-title.m4a');
    expect(getMusicTrack('tense-campfire')?.src).toContain('music-tense-campfire.m4a');
    expect(getMusicTrack('tense-casino')?.src).toContain('music-tense-casino.m4a');
    expect(getMusicTrack('tense-snug')?.src).toContain('music-tense-snug.m4a');
    expect(getMusicTrack('nope')).toBeUndefined();
  });

  it('ships every declared track as non-empty AAC-LC in an M4A container', () => {
    expect(MUSIC_TRACKS.length).toBeGreaterThan(0);
    for (const song of MUSIC_TRACKS) {
      const path = join(process.cwd(), 'public', song.src);
      expect(statSync(path).size, `${song.id} is not an empty placeholder`).toBeGreaterThan(50_000);
      const header = readFileSync(path).subarray(0, 12);
      expect(header.subarray(4, 8).toString(), `${song.id} is not an ISO BMFF file`).toBe('ftyp');
    }

    const libraryFiles = readdirSync(join(process.cwd(), 'public/audio/music'));
    expect(libraryFiles.filter((name) => name.endsWith('.mp3'))).toEqual([]);
  });

  it('provides a menu theme on the base pack and keeps tense out of the picker', () => {
    expect(PARLOUR_PACK.menu).toEqual(MENU_PLAYLIST);
    expect(menuPlaylistSrc()).toContain('/audio/music/music-title.m4a');

    expect(getMusicPack('tense')).toBeUndefined();
    expect(listMusicPacks().map((pack) => pack.id)).not.toContain('tense');

    for (const scene of SCENE_IDS) {
      expect(PARLOUR_PACK.sceneMoods?.[scene]?.tense).toEqual(TENSE_PLAYLISTS[scene]);
      expect(moodForPack(PARLOUR_PACK, 'tense', scene)[0]?.src).toContain(
        `music-tense-${scene}.m4a`,
      );
    }
    expect(moodForPack(PARLOUR_PACK, 'nope')).toEqual([]);

    for (const scene of SCENE_IDS) {
      expect(playlistForPack(PARLOUR_PACK, scene)).toEqual(tracksForScene(scene));
    }
  });

  it('lets a game pack globally override tense music and inherit moods it omits', () => {
    const own = { id: 'wild-tense', title: 'Pile Pressure', src: '/audio/music/wild-tense.mp3' };
    registerMusicPack({
      id: 'mood-game',
      label: 'Mood Game',
      playlists: {},
      moods: { tense: [own] },
    });
    const pack = getMusicPack('mood-game');

    expect(moodForPack(pack, 'tense', 'campfire')).toEqual([own]);
    expect(moodForPack(pack, 'tense', 'casino')).toEqual([own]);
    expect(moodForPack(pack, 'tense', 'snug')).toEqual([own]);
    expect(getMusicTrack('wild-tense')).toEqual(own);
    expect(moodForPack(pack, 'unknown-mood')).toEqual([]);

    unregisterMusicPack('mood-game');
  });

  it('lets a game pack override one scene mood and inherit themed Parlour cues elsewhere', () => {
    const own = {
      id: 'casino-sudden-death',
      title: 'Loaded Dice',
      src: '/audio/music/casino-sudden-death.m4a',
    };
    registerMusicPack({
      id: 'scene-mood-game',
      label: 'Scene Mood Game',
      playlists: {},
      sceneMoods: { casino: { tense: [own] } },
    });
    const pack = getMusicPack('scene-mood-game');

    expect(moodForPack(pack, 'tense', 'casino')).toEqual([own]);
    expect(moodForPack(pack, 'tense', 'campfire')).toEqual(TENSE_PLAYLISTS.campfire);
    expect(moodForPack(pack, 'tense', 'snug')).toEqual(TENSE_PLAYLISTS.snug);
    expect(getMusicTrack('casino-sudden-death')).toEqual(own);

    unregisterMusicPack('scene-mood-game');
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
