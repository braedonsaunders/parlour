import { describe, expect, it } from 'vitest';
import {
  createRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  normalizeRoomCode,
  resolveRoomShareOrigin,
  roomJoinUrl,
  validateRoomCode,
  validateRoomHostPubkey,
} from './code';

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

  it('creates a valid code from an injected byte source', () => {
    const requestedLengths: number[] = [];
    const code = createRoomCode((length) => {
      requestedLengths.push(length);
      return Uint8Array.from([0, 1, 31, 32]);
    });

    expect(requestedLengths).toEqual([ROOM_CODE_LENGTH]);
    expect(code).toBe('AB9A');
    expect(validateRoomCode(code)).toEqual({ ok: true, code });
  });

  it('rejects a byte source that cannot fill a room code', () => {
    expect(() => createRoomCode(() => Uint8Array.from([1, 2, 3]))).toThrow(
      'room code source returned too few bytes',
    );
  });

  it('builds join URLs only for validated room codes', () => {
    expect(roomJoinUrl('https://parlour.app/', ' ab-2z ')).toBe(
      'https://parlour.app/join/?code=AB2Z',
    );
    expect(() => roomJoinUrl('https://parlour.app/', 'OI10')).toThrow('invalid room code');

    const host = 'ab'.repeat(32);
    expect(roomJoinUrl('https://parlour.app/', 'AB2Z', host)).toBe(
      `https://parlour.app/join/?code=AB2Z&host=${host}`,
    );
    expect(validateRoomHostPubkey(host.toUpperCase())).toBe(host);
    expect(validateRoomHostPubkey('not-a-key')).toBeNull();
    expect(() => roomJoinUrl('https://parlour.app/', 'AB2Z', 'not-a-key')).toThrow(
      'invalid room host public key',
    );
  });

  it('prefers a configured public share origin for packaged clients', () => {
    expect(resolveRoomShareOrigin('http://tauri.localhost', 'https://play.parlour.app/path')).toBe(
      'https://play.parlour.app',
    );
    expect(resolveRoomShareOrigin('https://preview.example')).toBe('https://preview.example');
    expect(() => resolveRoomShareOrigin('http://tauri.localhost', 'tauri://localhost')).toThrow(
      'room share origin must use http or https',
    );
  });
});
