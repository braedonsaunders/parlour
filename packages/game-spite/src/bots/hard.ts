import type { BotPolicy } from '@parlour/engine';
import { isWildCard, LAST_RANK, spiteFace } from '../cards';
import type { SpiteState } from '../state';
import { buildOptions } from './evaluate';
import { chooseDiscard, scoreBuild } from './medium';
import { HARD_PARAMS, type BotParams } from './shared';

/**
 * Hard: Medium's payoff discipline plus three habits that take the long view —
 * wilds stay in hand until they unblock the payoff card itself, discards stack
 * into descending runs worth unloading later, and a play that leaves a centre
 * pile sitting exactly where the next seat wants it costs points.
 */
export function makeHardBot(
  params: BotParams = HARD_PARAMS,
  id = 'spite-hard',
  label = 'Hard',
): BotPolicy<SpiteState> {
  return {
    id,
    label,
    tier: 3,
    chooseMove(view, seat, legal, rng) {
      const builds = buildOptions(view, legal, seat);
      if (builds.length > 0) {
        // Only look at what the next seat is holding when the persona actually
        // cares; the default Hard params weight this at zero (see shared.ts).
        const rival = (seat + 1) % view.seats;
        const rivalTops =
          params.blockAwareness === 0
            ? []
            : [
                view.payoffs[rival]?.[0],
                ...(view.discards[rival] ?? []).map((pile) => pile[0]),
              ].filter((card): card is NonNullable<typeof card> => card !== undefined);

        let best = builds[0]!;
        let bestScore = -Infinity;
        for (const option of builds) {
          let score = scoreBuild(view, seat, option, params, rng);

          // A hand wild is spent only when it moves the pile onto the very
          // rank the payoff top needs next; otherwise it waits.
          if (option.wild && option.source.kind === 'hand') {
            const payoffTop = view.payoffs[seat]?.[0];
            const chainRank =
              payoffTop === undefined || isWildCard(payoffTop)
                ? null
                : spiteFace(payoffTop).meta.value;
            if (chainRank !== null && option.rank + 1 === chainRank) score += params.wildHold / 2;
          }

          // What will this pile demand after my card lands? If the answer is
          // exactly what a rival has showing — or they hold a wild on top,
          // which fits anything — the play feeds them.
          const demandAfter = option.rank + 1;
          if (demandAfter <= LAST_RANK) {
            for (const top of rivalTops) {
              if (isWildCard(top) || spiteFace(top).meta.value === demandAfter) {
                score -= params.blockAwareness;
              }
            }
          }
          if (score > bestScore) {
            bestScore = score;
            best = option;
          }
        }
        return best.move;
      }
      return chooseDiscard(view, seat, legal, rng, params.runKeep);
    },
  };
}
