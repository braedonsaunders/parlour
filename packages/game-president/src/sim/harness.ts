import {
  actingSeats,
  chooseBotMove,
  createSession,
  makeRng,
  replaySession,
  stateHash,
  sessionApply,
  type AppliedEvent,
  type BotPolicy,
  type GameSession,
  type MatchResult,
} from '@parlour/engine';
import { presidentGame } from '../game';
import type { PresidentRules } from '../config';
import type { PresidentState } from '../state';

export const MAX_STEPS_PER_MATCH = 20_000;

export interface MatchRun {
  seed: number;
  result: MatchResult;
  /** total engine events applied */
  steps: number;
  /** completed deals */
  deals: number;
}

/**
 * Plays one full bot-vs-bot President match headless. Every seat uses its own
 * policy, exactly like a table mixing personas. Throws on stalls or illegal
 * bot choices so balance regressions fail loudly.
 */
export function runMatch(
  seed: number,
  seats: number,
  policies: readonly BotPolicy<PresidentState>[],
  config: PresidentRules = presidentGame.configSchema.defaults(),
): MatchRun {
  let session: GameSession<PresidentState, PresidentRules> = createSession(presidentGame, {
    seed: seed | 0,
    config,
    seats,
  });
  let steps = 0;
  while (session.status === 'playing') {
    if (steps++ > MAX_STEPS_PER_MATCH) {
      throw new Error(`president match ${seed} stalled after ${MAX_STEPS_PER_MATCH} steps`);
    }
    const actors = actingSeats(session.phase);
    const seat = actors[0];
    if (seat === undefined || seat === null) {
      throw new Error(`president match ${seed}: no actor in phase ${session.phase.phase}`);
    }
    const outcome = applyBotStep(session, seat, policies);
    if (outcome.rejected) {
      throw new Error(
        `president match ${seed}: bot ${seat} ${outcome.rejected.code}: ${outcome.rejected.message}`,
      );
    }
    session = outcome.session;
  }
  if (!session.result) throw new Error(`president match ${seed} ended without a result`);
  return { seed, result: session.result, steps, deals: session.state.deal + 1 };
}

function applyBotStep(
  session: GameSession<PresidentState, PresidentRules>,
  seat: number,
  policies: readonly BotPolicy<PresidentState>[],
): ReturnType<typeof sessionApply<PresidentState, PresidentRules>> {
  const legal = session.def.flow.legalMovesFor
    ? session.def.flow.legalMovesFor(session.state, session.phase, seat)
    : session.def.flow.legalMoves(session.state, session.phase);
  if (legal.length === 0) {
    throw new Error(`president sim: seat ${seat} has no legal move in ${session.phase.phase}`);
  }
  const policy = policies[seat % policies.length];
  if (!policy) throw new Error('president sim: missing bot policy');
  const rng = makeRng(session.seed).fork(`bot:${session.log.length}`);
  const view = session.def.playerView(session.state, seat);
  const choice = chooseBotMove(policy, view, seat, legal, rng) ?? legal[0]!;
  return sessionApply(presidentGame, session, seat, choice.id, choice.payload);
}

/**
 * Replays `log` from `seed` and compares final hashes — the deterministic
 * replay guarantee behind multiplayer divergence detection.
 */
export function replayMatches(
  seed: number,
  seats: number,
  log: readonly AppliedEvent[],
  config: PresidentRules = presidentGame.configSchema.defaults(),
): boolean {
  const replayed = replaySession(presidentGame, seed, log, { config, seats });
  const expected = log[log.length - 1]?.hash;
  return expected === undefined || stateHash(replayed.state) === expected;
}
