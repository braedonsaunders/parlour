import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOUND_MANIFEST } from './manifest';

const REQUIRED_SOUNDS = [
  'card.slide',
  'card.snap',
  'deal.riffle',
  'knock.thud',
  'blitz.fanfare',
  'chip.clink',
  'turn.tick',
  'ui.pop',
  'win.jingle',
  'lose.sting',
] as const;

describe('production audio suite', () => {
  it('ships every required sound as a valid non-empty WAV', () => {
    const byId = new Map(SOUND_MANIFEST.map((sound) => [sound.id, sound]));

    for (const id of REQUIRED_SOUNDS) {
      const sound = byId.get(id);
      expect(sound, `${id} is declared`).toBeDefined();
      const path = join(process.cwd(), 'public', sound!.src);
      expect(statSync(path).size, `${id} is not an empty placeholder`).toBeGreaterThan(1_000);
      const header = readFileSync(path).subarray(0, 12);
      expect(header.subarray(0, 4).toString()).toBe('RIFF');
      expect(header.subarray(8, 12).toString()).toBe('WAVE');
    }
  });

  it('reserves every manifest slot for SFX; music lives in the music manifest', () => {
    for (const sound of SOUND_MANIFEST) {
      expect(sound.channel).toBe('sfx');
    }
    expect(SOUND_MANIFEST.some((sound) => sound.id === 'music.parlour')).toBe(false);
  });
});
