import type { Rng } from '@parlour/engine';

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

/** Deterministic code generation from the engine's seeded Rng (host-side). */
export function makeRoomCode(rng: Rng): NormalizedRoomCode {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) out += rng.pick(ROOM_CODE_ALPHABET.split(''));
  return out;
}
