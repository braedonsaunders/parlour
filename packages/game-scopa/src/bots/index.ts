import type { BotPolicy, LegalMove, PersonaMeta, Rng, SeatId } from '@parlour/engine';
import { captureValue } from '../cards';
import type { ScopaState } from '../state';
import { decidePlay, HARD_PARAMS, MEDIUM_PARAMS, type PlayParams } from './evaluate';

export {
  decidePlay,
  rankPlays,
  unseenValueCounts,
  HARD_PARAMS,
  MEDIUM_PARAMS,
  type PlayParams,
} from './evaluate';

/**
 * Easy plays like a bar beginner: grab the biggest capture on the table, and
 * when nothing captures, get rid of the lowest card.
 */
function easyChooseMove(legal: readonly LegalMove[], rng: Rng): LegalMove | null {
  const moves = parseForEasy(legal);
  if (moves.length === 0) return null;
  const takes = moves.filter((move) => move.take.length > 0);
  if (takes.length > 0) {
    const best = Math.max(...takes.map((move) => move.take.length));
    const candidates = takes.filter((move) => move.take.length === best);
    return rng.pick(candidates).move;
  }
  const lowest = Math.min(...moves.map((move) => captureValue(move.card)));
  return rng.pick(moves.filter((move) => captureValue(move.card) === lowest)).move;
}

interface EasyMove {
  move: LegalMove;
  card: string;
  take: readonly unknown[];
}

function parseForEasy(legal: readonly LegalMove[]): EasyMove[] {
  const parsed: EasyMove[] = [];
  for (const move of legal) {
    if (move.id !== 'playCard') continue;
    const payload = move.payload as { card?: unknown; take?: unknown } | undefined;
    if (typeof payload?.card !== 'string') continue;
    parsed.push({
      move,
      card: payload.card,
      take: Array.isArray(payload.take) ? payload.take : [],
    });
  }
  return parsed;
}

export interface BotProfile {
  params: PlayParams;
  /** easy tier bypasses the scoring model entirely */
  simple?: boolean;
}

const EASY_PROFILE: BotProfile = { params: MEDIUM_PARAMS, simple: true };
const MEDIUM_PROFILE: BotProfile = { params: MEDIUM_PARAMS };
const HARD_PROFILE: BotProfile = { params: HARD_PARAMS };

export function profileForTier(tier: 1 | 2 | 3): BotProfile {
  return tier === 1 ? EASY_PROFILE : tier === 2 ? MEDIUM_PROFILE : HARD_PROFILE;
}

export function chooseFromProfile(
  view: ScopaState,
  seat: SeatId,
  legal: readonly LegalMove[],
  rng: Rng,
  profile: BotProfile,
): LegalMove | null {
  if (legal.length === 0) return null;
  if (profile.simple) return easyChooseMove(legal, rng);
  const choice = decidePlay(view, legal, rng, profile.params);
  return choice ?? rng.pick(legal);
}

export function makePolicy(
  id: string,
  label: string,
  tier: 1 | 2 | 3,
  profile: BotProfile = profileForTier(tier),
  persona?: PersonaMeta,
): BotPolicy<ScopaState> {
  return {
    id,
    label,
    tier,
    ...(persona ? { persona } : {}),
    chooseMove(view, seat, legal, rng) {
      return chooseFromProfile(view, seat, legal, rng, profile);
    },
  };
}

export const TIER_BOTS: readonly BotPolicy<ScopaState>[] = [
  makePolicy('scopa-easy', 'Easy', 1),
  makePolicy('scopa-medium', 'Medium', 2),
  makePolicy('scopa-hard', 'Hard', 3),
];

export function tierBot(tier: 1 | 2 | 3): BotPolicy<ScopaState> {
  const bot = TIER_BOTS.find((candidate) => candidate.tier === tier);
  if (!bot) throw new Error(`no bot policy for tier ${tier}`);
  return bot;
}
