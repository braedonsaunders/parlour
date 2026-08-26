import type { RecoveryPolicy } from '@/lib/multiplayer/veil';
import type { Translator } from './index';

/**
 * Registry refusals are authoritative in English; these keys are their
 * translations. Keeping the mapping visible lets the catalogue test prove
 * that a newly refusing game cannot quietly fall back to English.
 */
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
