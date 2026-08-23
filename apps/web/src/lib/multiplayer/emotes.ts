import type { Emote } from './types';

export const EMOTES: readonly Emote[] = ['hello', 'nice', 'oops', 'wow', 'hurry', 'gg'];
export const EMOTE_COOLDOWN_MS = 750;

export function validateEmote(
  emote: string,
  lastSentAt: number,
  now: () => number,
): { ok: true; sentAt: number } | { ok: false; reason: 'unsupported-emote' | 'rate-limited' } {
  if (!EMOTES.includes(emote as Emote)) return { ok: false, reason: 'unsupported-emote' };
  const sentAt = now();
  if (sentAt - lastSentAt < EMOTE_COOLDOWN_MS) return { ok: false, reason: 'rate-limited' };
  return { ok: true, sentAt };
}
