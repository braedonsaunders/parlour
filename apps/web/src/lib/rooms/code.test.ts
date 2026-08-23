import { describe, expect, it } from 'vitest';
import { makeRng } from '@parlour/engine';
import { ROOM_CODE_ALPHABET, makeRoomCode, normalizeRoomCode, validateRoomCode } from './code';

describe('room codes', () => {
  it('alphabet excludes ambiguous glyphs 0 O 1 I', () => {
    for (const banned of ['0', 'O', '1', 'I']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(banned);
    }
    expect(new Set(ROOM_CODE_ALPHABET.split('')).size).toBe(ROOM_CODE_ALPHABET.length);
  });

  it('normalizes case and strips separators and whitespace', () => {
    expect(normalizeRoomCode('ab-cd')).toBe('ABCD');
    expect(normalizeRoomCode(' k7 p9 ')).toBe('K7P9');
  });

  it('accepts a well-formed code', () => {
    const verdict = validateRoomCode('k7p9');
    expect(verdict).toEqual({ ok: true, code: 'K7P9' });
  });

  it('rejects wrong lengths with the expected shape', () => {
    expect(validateRoomCode('ABC')).toMatchObject({
      ok: false,
      issue: { reason: 'length', got: 3 },
    });
    expect(validateRoomCode('ABCDE')).toMatchObject({
      ok: false,
      issue: { reason: 'length', got: 5 },
    });
    expect(validateRoomCode('')).toMatchObject({ ok: false, issue: { reason: 'length', got: 0 } });
  });

  it('reports every offending character including lookalikes 0 O 1 I', () => {
    const verdict = validateRoomCode('A0OI');
    expect(verdict).toEqual({
      ok: false,
      issue: { reason: 'charset', offending: ['0', 'O', 'I'] },
    });
  });

  it('charset check runs only after length passes', () => {
    expect(validateRoomCode('00').ok).toBe(false);
    expect(validateRoomCode('0000')).toMatchObject({ ok: false, issue: { reason: 'charset' } });
  });

  it('makeRoomCode is deterministic under a seeded rng and always valid', () => {
    const rng = makeRng(1234);
    const code = makeRoomCode(rng);
    expect(code).toBe(makeRoomCode(makeRng(1234)));
    expect(validateRoomCode(code)).toEqual({ ok: true, code });
  });
});
