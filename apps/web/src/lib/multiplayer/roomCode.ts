export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 4;

export function normalizeRoomCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (normalized.length !== ROOM_CODE_LENGTH) return null;
  return [...normalized].every((character) => ROOM_CODE_ALPHABET.includes(character))
    ? normalized
    : null;
}

export function createRoomCode(randomBytes: (length: number) => Uint8Array): string {
  const bytes = randomBytes(ROOM_CODE_LENGTH);
  if (bytes.length < ROOM_CODE_LENGTH) throw new Error('room code source returned too few bytes');
  return [...bytes]
    .slice(0, ROOM_CODE_LENGTH)
    .map((value) => ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length])
    .join('');
}

export function roomJoinUrl(origin: string, code: string): string {
  const normalized = normalizeRoomCode(code);
  if (!normalized) throw new Error('invalid room code');
  return new URL(`/join/${normalized}`, origin).toString();
}
