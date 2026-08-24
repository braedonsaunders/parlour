import { afterEach, describe, expect, it } from 'vitest';
import {
  PARLOUR_SFX_PACK,
  listSfxPacks,
  registerSfxPack,
  soundCuesForFx,
  soundDefsForSfxPack,
  unregisterSfxPack,
  type SfxPack,
} from './sfx';

const TEST_PACK_ID = 'test-game';

afterEach(() => unregisterSfxPack(TEST_PACK_ID));

describe('authorable SFX packs', () => {
  it('lets a game contribute assets and map its own engine fx without core edits', () => {
    const pack: SfxPack = {
      id: TEST_PACK_ID,
      label: 'Test game',
      sounds: [
        {
          id: `${TEST_PACK_ID}.combo`,
          src: '/audio/test-game/combo.mp3',
          channel: 'sfx',
          cap: 2,
          minInterval: 80,
        },
      ],
      cuesForFx: (fx) =>
        fx
          .filter((event) => event.kind === 'test-game.combo')
          .map((event) => ({ id: `${TEST_PACK_ID}.combo`, atMs: Math.max(0, event.at ?? 0) })),
    };

    registerSfxPack(pack);

    expect(listSfxPacks()).toContain(pack);
    expect(soundDefsForSfxPack(TEST_PACK_ID)).toEqual([...PARLOUR_SFX_PACK.sounds, ...pack.sounds]);
    expect(
      soundCuesForFx([{ kind: 'test-game.combo', payload: { amount: 3 }, at: 120 }], TEST_PACK_ID),
    ).toEqual([{ id: 'test-game.combo', atMs: 120 }]);
  });

  it('rejects unnamespaced assets and mappings to undeclared sounds', () => {
    expect(() =>
      registerSfxPack({
        id: TEST_PACK_ID,
        label: 'Bad namespace',
        sounds: [{ id: 'someone-else.sound', src: '/bad.mp3', channel: 'sfx' }],
      }),
    ).toThrow('must use the test-game. namespace');

    registerSfxPack({
      id: TEST_PACK_ID,
      label: 'Bad mapping',
      sounds: [],
      cuesForFx: () => [{ id: 'test-game.missing', atMs: 0 }],
    });
    expect(() => soundCuesForFx([], TEST_PACK_ID)).toThrow('mapped an undeclared sound');
  });
});
