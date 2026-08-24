import type { CardId } from '@parlour/engine';
import type { RatscrewConfig } from './config';

export type SlapPattern = 'double' | 'sandwich' | 'ten';

/** Pip rank of a std-deck card id ('H12' → 12, face cards stay 11–13). */
export function rankOf(card: CardId): number {
  const rank = Number(card.slice(1));
  if (!Number.isInteger(rank) || rank < 1 || rank > 13) {
    throw new Error(`not a std-deck card id: ${card}`);
  }
  return rank;
}

/** J, Q, K and the Ace, which std-deck ids encode as rank 1 rather than 14. */
export function isFaceCard(card: CardId): boolean {
  const rank = rankOf(card);
  return rank === ACE || rank >= 11;
}

/** Chances the next player gets to match a face card: J=1, Q=2, K=3, A=4. */
export function chancesFor(card: CardId): number {
  const rank = rankOf(card);
  return rank === ACE ? 4 : rank - 10;
}

const ACE = 1;

/**
 * Detects the slap pattern sitting on top of the center pile (bottom-first
 * order). Priority: double > sandwich > ten. Returns null when nothing is
 * slappable under the enabled house rules.
 */
export function detectPattern(
  center: readonly CardId[],
  rules: Pick<RatscrewConfig, 'doubles' | 'sandwiches' | 'tens'>,
): SlapPattern | null {
  const count = center.length;
  if (count < 2) return null;
  const top = rankOf(center[count - 1] as CardId);
  const under = rankOf(center[count - 2] as CardId);
  if (rules.doubles && top === under) return 'double';
  if (rules.sandwiches && count >= 3 && top === rankOf(center[count - 3] as CardId)) {
    return 'sandwich';
  }
  // Pip cards only — an Ace counts as a face card here, so it never sums to ten.
  const pips = !isFaceCard(center[count - 1] as CardId) && !isFaceCard(center[count - 2] as CardId);
  if (rules.tens && pips && top + under === 10) return 'ten';
  return null;
}
