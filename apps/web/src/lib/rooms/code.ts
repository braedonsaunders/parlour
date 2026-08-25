/**
 * 4-char room codes over an unambiguous alphabet (spec §4.2):
 * no 0/O/1/I — everything a human reads or types stays decidable.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const ROOM_CODE_LENGTH = 4;

export const ROOM_HOST_PUBKEY_LENGTH = 64;

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
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index++) {
    const value = bytes[index];
    if (value === undefined) throw new Error('room code source returned too few bytes');
    code += ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

export function resolveRoomShareOrigin(runtimeOrigin: string, configuredOrigin?: string): string {
  if (!configuredOrigin?.trim()) return runtimeOrigin;

  const url = new URL(configuredOrigin);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('room share origin must use http or https');
  }
  return url.origin;
}

export function validateRoomHostPubkey(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  return value?.length === ROOM_HOST_PUBKEY_LENGTH && /^[0-9a-f]+$/.test(value) ? value : null;
}

export function roomJoinUrl(origin: string, rawCode: string, hostPubkey?: string): string {
  const verdict = validateRoomCode(rawCode);
  if (!verdict.ok) throw new Error('invalid room code');
  const url = new URL('/join/', origin);
  url.searchParams.set('code', verdict.code);
  if (hostPubkey !== undefined) {
    const host = validateRoomHostPubkey(hostPubkey);
    if (!host) throw new Error('invalid room host public key');
    url.searchParams.set('host', host);
  }
  return url.toString();
}
