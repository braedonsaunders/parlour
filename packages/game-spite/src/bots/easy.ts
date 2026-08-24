import type { BotPolicy, LegalMove, Rng } from '@parlour/engine';
import type { SpiteState } from '../state';
import { discardOptions } from './evaluate';
import { EASY_PARAMS, type BotParams } from './shared';

/**
 * Easy: plays the first legal centre move it finds and discards at random.
 * It will happily burn a wild on a two and bury its best discard — that is
 * what makes it beatable.
 */
export function makeEasyBot(
  params: BotParams = EASY_PARAMS,
  id = 'spite-easy',
  label = 'Easy',
): BotPolicy<SpiteState> {
  return {
    id,
    label,
    tier: 1,
    chooseMove(_view: SpiteState, _seat: number, legal: readonly LegalMove[], rng: Rng) {
      void params;
      const build = legal.find((move) => move.id === 'build');
      if (build) return build;
      const discards = discardOptions(_view, legal);
      if (discards.length > 0) return discards[rng.int(discards.length)]!.move;
      return legal[0] ?? null;
    },
  };
}
