import type { CardId } from '@parlour/engine';
import type { RatscrewConfig } from './config';

export type SlapPattern = 'double' | 'sandwich' | 'marriage' | 'ten' | 'top-bottom' | 'run';

/**
 * Detection priority when several patterns land on the same flip — encoded by
 * the check order in {@link detectPattern}.
 */
export const SLAP_PATTERN_PRIORITY: readonly SlapPattern[] = [
  'double',
  'sandwich',
  'marriage',
  'ten',
  'top-bottom',
  'run',
];

const ACE = 1;
const JACK = 11;
const QUEEN = 12;
const KING = 13;

/** Pip rank of a std-deck card id ('H12' → 12, face cards stay 11–13). */
export function rankOf(card: CardId): number {
  const rank = Number(card.slice(1));
  if (!Number.isInteger(rank) || rank < ACE || rank > KING) {
    throw new Error(`not a std-deck card id: ${card}`);
  }
  return rank;
}

/** J, Q, K and the Ace, which std-deck ids encode as rank 1 rather than 14. */
export function isFaceCard(card: CardId): boolean {
  const rank = rankOf(card);
  return rank === ACE || rank >= JACK;
}

/** Chances the next player gets to match a face card: J=1, Q=2, K=3, A=4. */
export function chancesFor(card: CardId): number {
  const rank = rankOf(card);
  return rank === ACE ? 4 : rank - 10;
}

function isMarriage(under: number, top: number): boolean {
  return (under === KING && top === QUEEN) || (under === QUEEN && top === KING);
}

/** True when three ranks step by exactly one in a constant direction. */
export function isRun(oldest: number, middle: number, newest: number): boolean {
  return (
    (middle - oldest === 1 && newest - middle === 1) ||
    (oldest - middle === 1 && middle - newest === 1)
  );
}

/**
 * Detects the slap pattern sitting on top of the center pile (bottom-first
 * order). Checks run in `SLAP_PATTERN_PRIORITY` order; returns null when
 * nothing is slappable under the enabled house rules.
 */
export function detectPattern(
  center: readonly CardId[],
  rules: Pick<
    RatscrewConfig,
    'doubles' | 'sandwiches' | 'marriage' | 'tens' | 'topBottom' | 'runs'
  >,
): SlapPattern | null {
  const count = center.length;
  if (count < 2) return null;
  const topCard = center[count - 1] as CardId;
  const underCard = center[count - 2] as CardId;
  const top = rankOf(topCard);
  const under = rankOf(underCard);

  if (rules.doubles && top === under) return 'double';
  if (rules.sandwiches && count >= 3 && top === rankOf(center[count - 3] as CardId)) {
    return 'sandwich';
  }
  if (rules.marriage && isMarriage(under, top)) return 'marriage';
  // Pip cards only — an Ace counts as a face card here, so it never sums to ten.
  if (rules.tens && !isFaceCard(topCard) && !isFaceCard(underCard) && top + under === 10) {
    return 'ten';
  }
  if (rules.topBottom && top === rankOf(center[0] as CardId)) return 'top-bottom';
  if (rules.runs && count >= 3 && isRun(rankOf(center[count - 3] as CardId), under, top)) {
    return 'run';
  }
  return null;
}
