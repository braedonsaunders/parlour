import type { MatchResult, MatchResultRank, SeatId } from '@parlour/engine';
import { QUEEN_SPADES, cardPoints, isHeart } from './cards';
import type { HeartsRules } from './config';

export const MOON_POINTS = 26;

/** Raw points in the captured piles: hearts + Q♠ (− J♦ when the toggle is on). */
export function rawHandPoints(
  taken: readonly (readonly string[])[],
  jackDiamonds: boolean,
): number[] {
  return taken.map((cards) => cards.reduce((sum, card) => sum + cardPoints(card, jackDiamonds), 0));
}

export function heartsTaken(taken: readonly (readonly string[])[]): number[] {
  return taken.map((cards) => cards.filter(isHeart).length);
}

export function tookQueenOfSpades(taken: readonly (readonly string[])[]): boolean[] {
  return taken.map((cards) => cards.includes(QUEEN_SPADES));
}

/**
 * True when one seat captured every heart AND the queen — a shot moon.
 * J♦ never matters: the shooter may or may not hold it.
 */
export function moonShooterOf(taken: readonly (readonly string[])[]): SeatId | null {
  const shooters = taken
    .map((cards, seat) => ({
      seat,
      all: cards.filter(isHeart).length === 13 && cards.includes(QUEEN_SPADES),
    }))
    .filter((entry) => entry.all)
    .map((entry) => entry.seat);
  return shooters.length > 0 ? shooters[0]! : null;
}

/**
 * Final hand score per seat with the moon shift applied.
 * `opponents`: everyone but the shooter takes +26 (shooter keeps 0).
 * `self`: the shooter's own score drops by 26 — it can go negative.
 */
export function adjustedHandPoints(
  taken: readonly (readonly string[])[],
  rules: Pick<HeartsRules, 'jackDiamonds' | 'moonShift'>,
): { points: number[]; shooter: SeatId | null } {
  const points = rawHandPoints(taken, rules.jackDiamonds);
  const shooter = moonShooterOf(taken);
  if (shooter === null) return { points, shooter: null };
  if (rules.moonShift === 'self') {
    return { points: points.map((p, seat) => (seat === shooter ? p - MOON_POINTS : p)), shooter };
  }
  return {
    points: points.map((p, seat) => (seat === shooter ? 0 : p + MOON_POINTS)),
    shooter,
  };
}

const MOON_DETAIL_KEYS = ['points', 'hearts', 'queen', 'moon'] as const;

/**
 * Rankings for one completed hand: fewest adjusted points wins the hand,
 * ties share the rank. Detail carries what the match fold and UI need.
 */
export function handRankings(
  points: readonly number[],
  taken: readonly (readonly string[])[],
  disputed: readonly SeatId[],
): MatchResultRank[] {
  const hearts = heartsTaken(taken);
  const queens = tookQueenOfSpades(taken);
  const shooter = moonShooterOf(taken);
  const ordered = points
    .map((value, seat) => ({ seat, value }))
    .sort((a, b) => a.value - b.value || a.seat - b.seat);
  let priorValue: number | null = null;
  let priorRank = 0;
  return ordered.map(({ seat, value }, index) => {
    if (value !== priorValue) priorRank = index + 1;
    priorValue = value;
    const detail: Record<string, number | string | boolean> = {
      points: value,
      hearts: hearts[seat] ?? 0,
      queen: queens[seat] ?? false,
      moon: seat === shooter,
      disputed: disputed.includes(seat),
    };
    void MOON_DETAIL_KEYS;
    return { seat, rank: priorRank, detail };
  });
}

export function handResult(
  points: readonly number[],
  taken: readonly (readonly string[])[],
  disputed: readonly SeatId[],
): MatchResult {
  const shooter = moonShooterOf(taken);
  const rankings = handRankings(points, taken, disputed);
  const best = rankings[0]?.rank;
  const winners = rankings.filter((r) => r.rank === best && best === 1).map((r) => r.seat);
  return {
    winner: winners.length === 1 ? winners[0]! : null,
    rankings,
    reason: shooter !== null ? 'moon-shot' : 'hand-complete',
  };
}
