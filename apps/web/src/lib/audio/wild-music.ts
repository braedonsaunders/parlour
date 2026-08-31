import {
  BEACH_PLAYLIST,
  registerMusicPack,
  TENSE_PLAYLISTS,
  type MusicPack,
} from '@/lib/audio/music';

/**
 * Wild's own soundtrack: the beach scene's tropical house, on every background.
 *
 * Wild is the loud party table, and it earns the set's only game-specific
 * pack — sunny steel-drum house instead of the parlour's fireside hush. The
 * tracks are the beach scene's own (one shipped copy, one set of voices); this
 * pack simply plays them regardless of which background the player has picked,
 * because the vibe belongs to the game, not to the room it is played in.
 * Generation briefs live in `docs/music/SUNO-PROMPTS.md`.
 */
export const WILD_MUSIC_PACK: MusicPack = {
  id: 'wild',
  label: 'Wild — Tropical House',
  playlists: {
    campfire: BEACH_PLAYLIST,
    casino: BEACH_PLAYLIST,
    snug: BEACH_PLAYLIST,
    beach: BEACH_PLAYLIST,
  },
  moods: { tense: TENSE_PLAYLISTS.beach },
};

registerMusicPack(WILD_MUSIC_PACK);
