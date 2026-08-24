import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOUND_MANIFEST } from './manifest';

const REQUIRED_SOUNDS = [
  'parlour.card.draw.stock',
  'parlour.card.draw.discard',
  'parlour.card.discard.flight',
  'parlour.card.land',
  'parlour.card.flip',
  'parlour.deal.card',
  'parlour.stock.shuffle',
  'parlour.turn.ready',
  'parlour.ui.press',
  'parlour.match.win',
  'parlour.match.lose',
  'blitz.knock',
  'blitz.fanfare',
  'blitz.life.loss',
  'wildpile.wild.surge',
  'wildpile.reverse',
  'wildpile.skip',
  'wildpile.draw-stack',
  'wildpile.color',
  'wildpile.voice.reverse',
  'wildpile.voice.skip',
  'wildpile.voice.draw-two',
  'wildpile.voice.draw-four',
  'wildpile.voice.stacked',
  'wildpile.voice.wild',
  'wildpile.voice.red',
  'wildpile.voice.yellow',
  'wildpile.voice.green',
  'wildpile.voice.blue',
  'wildpile.voice.last-card',
] as const;

describe('production audio suite', () => {
  it('ships every required sound as a valid non-empty MP3', () => {
    const byId = new Map(SOUND_MANIFEST.map((sound) => [sound.id, sound]));

    for (const id of REQUIRED_SOUNDS) {
      const sound = byId.get(id);
      expect(sound, `${id} is declared`).toBeDefined();
      const path = join(process.cwd(), 'public', sound!.src);
      expect(statSync(path).size, `${id} is not an empty placeholder`).toBeGreaterThan(1_000);
      const header = readFileSync(path).subarray(0, 3);
      const hasId3 = header.toString() === 'ID3';
      const hasFrameSync = header[0] === 0xff && (header[1]! & 0xe0) === 0xe0;
      expect(hasId3 || hasFrameSync, `${id} is not MPEG audio`).toBe(true);
    }

    expect(SOUND_MANIFEST.map((sound) => sound.id)).toEqual(REQUIRED_SOUNDS);
  });

  it('reserves every manifest slot for SFX; music lives in the music manifest', () => {
    for (const sound of SOUND_MANIFEST) {
      expect(sound.channel).toBe('sfx');
    }
    expect(SOUND_MANIFEST.some((sound) => sound.id === 'music.parlour')).toBe(false);
  });
});
