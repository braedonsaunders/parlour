import { type MatchDef, type MatchFoldCtx, type MatchResult, type SeatId } from '@parlour/engine';
import { createOhHellDef, GAME_ID, type OhHellDefOptions } from './game';
import { rankByScore } from './score';
import { roundSchedule } from './schedule';
import type { OhHellRules } from './config';
import type { OhHellState } from './state';

/**
 * A full Oh Hell match: a schedule of shrinking/growing hands folded into
 * cumulative scores. Each round stays an ordinary GameDef session; the match
 * owns nothing but the fold. `roundConfig` is the point of this game — it is
 * what rewrites hand size and dealer for every round, exercising the platform
 * primitive nothing else on the shelf uses.
 */
export interface OhHellMatchState {
  seats: number;
  /** per-seat cumulative score across completed rounds */
  scores: number[];
  /** the hand sizes every round will deal — fixed at init so replay matches live play */
  schedule: readonly number[];
}

export const MATCH_ID = 'ohhell-match';

function pointsOf(result: MatchResult, seat: SeatId): number {
  const row = result.rankings.find((ranking) => ranking.seat === seat);
  const points = row?.detail?.points;
  return typeof points === 'number' ? points : 0;
}

export function createOhHellMatchDef(
  options: OhHellDefOptions = {},
): MatchDef<OhHellState, OhHellRules, OhHellMatchState> {
  return {
    id: MATCH_ID,
    game: createOhHellDef(options),

    init({ config, seats }) {
      return {
        seats,
        scores: Array.from({ length: seats }, () => 0),
        schedule: roundSchedule(config, seats),
      };
    },

    roundConfig(match, roundIndex, base) {
      const handSize = match.schedule[roundIndex] ?? base.handSize;
      return { ...base, handSize, dealer: roundIndex % match.seats };
    },

    fold(match, result, ctx: MatchFoldCtx<OhHellState>) {
      const scores = match.scores.map((score, seat) => score + pointsOf(result, seat));
      for (const seat of match.scores.keys()) {
        const delta = scores[seat]! - match.scores[seat]!;
        if (delta === 0) continue;
        ctx.fx.emit('ohhell.match-score', { seat, delta, total: scores[seat] });
      }
      return { ...match, scores };
    },

    matchEnd(match, ctx) {
      if (match.schedule.length > ctx.roundIndex + 1) return null;
      const ranked = rankByScore(match.scores, 'match-complete', (seat) => ({
        score: match.scores[seat] ?? 0,
      }));
      return {
        winner: ranked.winner,
        rankings: ranked.rankings,
        reason: `match-complete after ${ctx.roundIndex + 1} rounds`,
      };
    },
  };
}

export { GAME_ID as OHHELL_GAME_ID };
