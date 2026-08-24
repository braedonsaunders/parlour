import {
  Fx,
  type GameDef,
  type MatchDef,
  type MatchResult,
  type MatchResultRank,
  type Move,
  type SeatId,
} from '@parlour/engine';
import type { BlitzConfig } from './config';
import { createBlitzDef, type BlitzDefOptions } from './rules';
import type { BlitzState } from './state';

/**
 * Match formats as engine MatchDefs (spec §5.3). Each Blitz round stays a pure
 * @parlour/engine session; these defs own only the fold — lives or round-win
 * tallies — so a match is fully described by (seed, config, seats, roundLogs).
 * The timed format needs a wall clock and composes at the transport instead
 * (inject a tick, or keep the LocalTransport countdown).
 */

export const STARTING_LIVES = 3;
export const FIRST_TO_WINS = 3;
export const TIMED_DURATION_MS = 180_000;

export interface BlitzLivesMatchState {
  lives: readonly number[];
}

export interface BlitzWinsMatchState {
  wins: readonly number[];
}

export interface BlitzTimedMatchState extends BlitzWinsMatchState {
  expired: boolean;
  expiredAtMs: number | null;
}

export interface BlitzTimedRoundState extends BlitzState {
  matchClockExpiredAtMs: number | null;
}

function winnersOf(result: MatchResult): readonly SeatId[] {
  return result.rankings.filter((r) => r.rank === 1).map((r) => r.seat);
}

function lowestRankedSeats(rankings: readonly MatchResultRank[]): SeatId[] {
  if (rankings.length === 0) return [];
  const lowestRank = Math.max(...rankings.map(({ rank }) => rank));
  return rankings.flatMap(({ seat, rank }) => (rank === lowestRank ? [seat] : []));
}

function rankBy(values: readonly number[], reason: string): MatchResult {
  const ordered = values
    .map((value, seat) => ({ seat, value }))
    .sort((a, b) => b.value - a.value || a.seat - b.seat);
  let priorValue: number | null = null;
  let priorRank = 0;
  const rankings = ordered.map(({ seat, value }, index) => {
    if (value !== priorValue) priorRank = index + 1;
    priorValue = value;
    return { seat, rank: priorRank, detail: { value } };
  });
  const winner = rankings.length > 0 && rankings[0]!.rank === 1 ? rankings[0]!.seat : null;
  return { winner, rankings, reason };
}

/**
 * Classic: everyone starts with 3 lives; round losers (all non-winners on a
 * blitz) drop one; last seat standing takes the match.
 */
export function createBlitzLivesMatchDef(
  options: BlitzDefOptions & { startingLives?: number } = {},
): MatchDef<BlitzState, BlitzConfig, BlitzLivesMatchState> {
  const startingLives = options.startingLives ?? STARTING_LIVES;
  return {
    id: 'blitz-lives',
    game: createBlitzDef(options),
    init: ({ seats }) => ({ lives: Array.from({ length: seats }, () => startingLives) }),
    fold(match, result, ctx) {
      const winners = winnersOf(result);
      const losers =
        result.reason === 'blitz'
          ? match.lives.flatMap((_lives, seat) => (winners.includes(seat) ? [] : [seat]))
          : lowestRankedSeats(result.rankings);
      const lives = match.lives.slice();
      for (const seat of losers) {
        if ((lives[seat] ?? 0) <= 0) continue; // eliminated seats can't lose again
        lives[seat] = Math.max(0, (lives[seat] ?? 0) - 1);
        ctx.fx.emit(Fx.ChipLoss, { seat, livesLeft: lives[seat] });
      }
      return { lives };
    },
    matchEnd(match) {
      const standing = match.lives.flatMap((lives, seat) => (lives > 0 ? [seat] : []));
      if (standing.length > 1) return null;
      if (standing.length === 1) {
        return { ...rankBy(match.lives, 'last player standing'), winner: standing[0]! };
      }
      // the final seats died in the same fold (tieLowest 'both') — a drawn match
      return { ...rankBy(match.lives, 'simultaneous knockout'), winner: null };
    },
  };
}

/** Fast: first seat to take `target` rounds wins the match. */
export function createBlitzWinsMatchDef(
  options: BlitzDefOptions & { target?: number } = {},
): MatchDef<BlitzState, BlitzConfig, BlitzWinsMatchState> {
  const target = options.target ?? FIRST_TO_WINS;
  return {
    id: 'blitz-first-to',
    game: createBlitzDef(options),
    init: ({ seats }) => ({ wins: Array.from({ length: seats }, () => 0) }),
    fold(match, result, ctx) {
      const winners = winnersOf(result);
      const wins = match.wins.map((w, seat) => (winners.includes(seat) ? w + 1 : w));
      for (const seat of winners) {
        ctx.fx.emit('match.point', { seat, wins: wins[seat] });
      }
      return { wins };
    },
    matchEnd(match) {
      if (!match.wins.some((w) => w >= target)) return null;
      return rankBy(match.wins, `first to ${target}`);
    },
  };
}

function timedRoundGame(options: BlitzDefOptions, durationMs: number) {
  const base = createBlitzDef(options);
  const moves: Record<string, Move<BlitzTimedRoundState>> = {};
  for (const [id, move] of Object.entries(base.moves)) {
    moves[id] = {
      validate: (state, seat, payload) => move.validate(state, seat, payload),
      apply(state, seat, payload, ctx) {
        return {
          ...move.apply(state, seat, payload, ctx),
          matchClockExpiredAtMs: state.matchClockExpiredAtMs,
        };
      },
    };
  }
  moves['match.clock.expire'] = {
    validate: () => true,
    apply(state, _seat, _payload, ctx) {
      if (ctx.event.atMs === undefined) return state;
      ctx.fx.emit('match.clock.expired', { atMs: ctx.event.atMs });
      return { ...state, matchClockExpiredAtMs: ctx.event.atMs };
    },
  };

  const game: GameDef<BlitzTimedRoundState, BlitzConfig> = {
    id: 'blitz-timed-round',
    howToPlay: base.howToPlay,
    configSchema: base.configSchema,
    setup(ctx) {
      return { ...base.setup(ctx), matchClockExpiredAtMs: null };
    },
    moves,
    flow: {
      start: (state, seats) => base.flow.start(state, seats),
      legalMoves: (state, phase) => base.flow.legalMoves(state, phase),
      legalMovesFor: base.flow.legalMovesFor
        ? (state, phase, seat) => base.flow.legalMovesFor!(state, phase, seat)
        : undefined,
      advance(state, event, seats) {
        if (state.matchClockExpiredAtMs !== null) {
          return {
            phase: { phase: 'match-clock-expired', actor: null, round: 1 },
            ended: { winner: null, rankings: [], reason: 'match-clock-expired' },
          };
        }
        return base.flow.advance(state, event, seats);
      },
      canInject(_state, _phase, moveId, _payload, meta) {
        if (moveId !== 'match.clock.expire') {
          return { code: 'bad-injection', message: `${moveId} cannot be injected` };
        }
        if (meta.atMs === undefined || meta.atMs < durationMs) {
          return {
            code: 'clock-still-running',
            message: `the ${durationMs} ms match clock has not expired`,
          };
        }
        return true;
      },
    },
    playerView(state, seat) {
      return {
        ...base.playerView(state, seat),
        matchClockExpiredAtMs: state.matchClockExpiredAtMs,
      };
    },
    end(state) {
      if (state.matchClockExpiredAtMs !== null) {
        return { winner: null, rankings: [], reason: 'match-clock-expired' };
      }
      return base.end(state);
    },
    bots: base.bots,
  };
  return game;
}

/**
 * Timed: round wins accrue until the authority injects `match.clock.expire`.
 * A unique leader wins immediately; tied leaders continue through deterministic
 * sudden-death rounds until the tally has one leader.
 */
export function createBlitzTimedMatchDef(
  options: BlitzDefOptions & { durationMs?: number } = {},
): MatchDef<BlitzTimedRoundState, BlitzConfig, BlitzTimedMatchState> {
  const durationMs = options.durationMs ?? TIMED_DURATION_MS;
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new Error('durationMs must be a positive safe integer');
  }
  return {
    id: 'blitz-timed',
    game: timedRoundGame(options, durationMs),
    init: ({ seats }) => ({
      wins: Array.from({ length: seats }, () => 0),
      expired: false,
      expiredAtMs: null,
    }),
    fold(match, result, ctx) {
      if (result.reason === 'match-clock-expired') {
        return {
          ...match,
          expired: true,
          expiredAtMs: ctx.finalState.matchClockExpiredAtMs,
        };
      }
      const winners = winnersOf(result);
      const wins = match.wins.map((w, seat) => (winners.includes(seat) ? w + 1 : w));
      for (const seat of winners) ctx.fx.emit('match.point', { seat, wins: wins[seat] });
      return { ...match, wins };
    },
    matchEnd(match) {
      if (!match.expired) return null;
      const best = Math.max(...match.wins);
      if (match.wins.filter((wins) => wins === best).length !== 1) return null;
      return rankBy(match.wins, 'timed match');
    },
  };
}
