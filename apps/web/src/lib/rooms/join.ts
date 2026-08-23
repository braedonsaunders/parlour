import { validateRoomCode, type NormalizedRoomCode } from './code';

export type JoinFailureReason = 'bad-format' | 'no-directory';

export type JoinOutcome =
  | { ok: true; code: NormalizedRoomCode }
  | { ok: false; reason: JoinFailureReason; message: string };

/**
 * Resolves a room code to a live table. Friend-table transport (Nostr + WebRTC)
 * lands in M4 — until that directory exists, valid codes fail closed with an
 * honest "unreachable" outcome rather than pretending to connect.
 */
export async function attemptJoin(raw: string): Promise<JoinOutcome> {
  const verdict = validateRoomCode(raw);
  if (!verdict.ok) {
    const message =
      verdict.issue.reason === 'length'
        ? `Room codes are exactly ${verdict.issue.expected} characters.`
        : `Codes never use ${formatList(verdict.issue.offending)} — check the letters and try again.`;
    return { ok: false, reason: 'bad-format', message };
  }
  return {
    ok: false,
    reason: 'no-directory',
    message: `Table ${verdict.code} isn't answering. Friend tables arrive with the multiplayer update — solo play is open now.`,
  };
}

function formatList(chars: readonly string[]): string {
  return chars.map((c) => `“${c}”`).join(', ');
}
