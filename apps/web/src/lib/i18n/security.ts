import type { RecoveryPolicy } from '@/lib/multiplayer/veil';
import type { MultiplayerGameId } from '@/lib/rooms/gameIds';
import type { MessageKey, Translator } from './index';

/**
 * Registry refusals are authoritative in English; these keys are their
 * translations. Keeping the mapping visible lets the catalogue test prove
 * that a newly refusing game cannot quietly fall back to English.
 */
export const VEIL_REFUSAL_MESSAGE_KEYS = {
  scopa: 'security.refusal.scopa',
  spite: 'security.refusal.spite',
} as const satisfies Partial<Record<MultiplayerGameId, MessageKey>>;

export function veilRefusalMessageKey(gameId: MultiplayerGameId): MessageKey | null {
  return VEIL_REFUSAL_MESSAGE_KEYS[gameId as keyof typeof VEIL_REFUSAL_MESSAGE_KEYS] ?? null;
}

export function localizedVeilRefusal(gameId: MultiplayerGameId, t: Translator): string | null {
  const key = veilRefusalMessageKey(gameId);
  return key ? t(key) : null;
}

/**
 * The recovery policy owns the English promise because it owns the protocol.
 * Other catalogues mirror its three possible shapes without asking the UI to
 * reinterpret the privacy/recovery trade-off.
 */
export function localizedRecoveryDisclosure(policy: RecoveryPolicy, t: Translator): string {
  if (t.locale === 'en') return policy.disclosure;
  if (policy.mode === 'none') return t('security.recovery.none');
  if (policy.threshold === 1) return t('security.recovery.single');
  return t('security.recovery.threshold', {
    threshold: policy.threshold,
    holders: policy.holders,
  });
}
