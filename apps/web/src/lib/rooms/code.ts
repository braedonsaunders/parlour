/**
 * 4-char room codes over an unambiguous alphabet (spec §4.2):
 * no 0/O/1/I — everything a human reads or types stays decidable.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const ROOM_CODE_LENGTH = 4;

export type NormalizedRoomCode = string;

export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type RoomCodeIssue =
  { reason: 'length'; expected: number; got: number } | { reason: 'charset'; offending: string[] };

export function validateRoomCode(
  raw: string,
): { ok: true; code: NormalizedRoomCode } | { ok: false; issue: RoomCodeIssue } {
  const code = normalizeRoomCode(raw);
  if (code.length !== ROOM_CODE_LENGTH) {
    return { ok: false, issue: { reason: 'length', expected: ROOM_CODE_LENGTH, got: code.length } };
  }
  const allowed = new Set(ROOM_CODE_ALPHABET.split(''));
  const offending = Array.from(new Set(code.split(''))).filter((ch) => !allowed.has(ch));
  if (offending.length > 0) {
    return { ok: false, issue: { reason: 'charset', offending } };
  }
  return { ok: true, code };
}

export function createRoomCode(randomBytes: (length: number) => Uint8Array): NormalizedRoomCode {
  const bytes = randomBytes(ROOM_CODE_LENGTH);
  if (bytes.length < ROOM_CODE_LENGTH) throw new Error('room code source returned too few bytes');
  return [...bytes]
    .slice(0, ROOM_CODE_LENGTH)
    .map((value) => ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length])
    .join('');
}

export function roomJoinUrl(origin: string, rawCode: string): string {
  const verdict = validateRoomCode(rawCode);
  if (!verdict.ok) throw new Error('invalid room code');
  return new URL(`/join/${verdict.code}`, origin).toString();
}
