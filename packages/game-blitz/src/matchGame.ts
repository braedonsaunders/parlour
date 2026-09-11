import {
  Fx,
  isVeiledDealPayload,
  VEILED_REDEAL_PENDING,
  type BotPolicy,
  type FlowAdvance,
  type GameDef,
  type MatchResult,
  type MatchResultRank,
  type Move,
  type MoveCtx,
  type PhaseState,
  type RuleError,
  type SeatId,
} from '@parlour/engine';
import type { BlitzConfig } from './config';
import { FIRST_TO_WINS, lowestRankedSeats, STARTING_LIVES } from './match';
import { blitzVeil, createBlitzDef, dealBlitzRound } from './rules';
import {
  liveSeats,
  type BlitzMatchFormat,
  type BlitzMatchState,
  type BlitzSeatMetrics,
  type BlitzState,
} from './state';

/**
 * The Blitz match as one deterministic session.
 *
 * Blitz is not a hand, it is a match of hands: three lives each, a life to
 * every seat that loses a round, last seat standing takes it. Solo already
 * played it that way through a transport that composed one session per round —
 * but a friend room is a *single* replicated session, so a room built on the
 * round def played exactly one round, nobody's lives ever moved, and the podium
 * was handed one deal's hand values instead of a match score.
 *
 * Gin hit this first and solved it here, in the game def: the match state holds
 * the live round, `round.fold` banks it, seats ready up in the window after it,
 * and `next.round` deals again from the per-event rng stream — replay-stable
 * like everything else. This is that shape for Blitz.
 *
 * A veiled match deals every round the way it deals the first: the room runs a
 * fresh shuffle ceremony and hands the deck to `next.round`, which is why the
 * move requires one rather than falling back to the session rng.
 */

/** Round-level moves the match def re-exposes verbatim. */
const ROUND_MOVES = [
  'draw.stock',
  'draw.discard',
  'discard',
  'knock',
  'blitz',
  'showdown',
  'blitz.claim',
  'showdown.open',
] as const;

const NO_METRICS: BlitzSeatMetrics = { blitzes: 0, knocks: 0, knockWins: 0 };

export interface BlitzMatchDefOptions {
  /** Round-level bot policies, adapted to the match view. */
  bots?: readonly BotPolicy<BlitzState>[];
  /** Classic knockout (default) or a race to `target` round wins. */
  format?: BlitzMatchFormat;
  startingLives?: number;
  target?: number;
}

export function createBlitzMatchDef(
  options: BlitzMatchDefOptions = {},
): GameDef<BlitzMatchState, BlitzConfig> {
  const round = createBlitzDef(options.bots ? { bots: options.bots } : {});
  const format = options.format ?? 'lives';
  const startingLives = options.startingLives ?? STARTING_LIVES;
  const target = options.target ?? FIRST_TO_WINS;

  const moves: Record<string, Move<BlitzMatchState>> = {};
  for (const moveId of ROUND_MOVES) {
    const inner = round.moves[moveId];
    if (!inner) throw new Error(`blitz match: round def is missing move ${moveId}`);
    moves[moveId] = {
      validate(state, seat, payload) {
        return inner.validate(state.round, seat, payload);
      },
      apply(state, seat, payload, ctx) {
        return { ...state, round: inner.apply(state.round, seat, payload, ctx) };
      },
    };
  }

  moves['round.fold'] = {
    validate(state) {
      if (!state.folded && state.round.outcome) return true;
      return { code: 'nothing-to-fold', message: 'the current round has no outcome' };
    },
    apply(state, _seat, _payload, ctx) {
      const outcome = state.round.outcome;
      if (!outcome) throw new Error('round.fold applied to a round with no outcome');
      const winners = outcome.winners;
      const lives = [...state.lives];
      const wins = [...state.wins];
      const metrics = state.metrics.map((metric) => ({ ...metric }));

      if (outcome.reason === 'blitz') {
        for (const seat of winners) {
          const metric = metrics[seat];
          if (metric) metric.blitzes += 1;
        }
      }
      const knocker = state.round.knocker;
      const knockerMetric = knocker === null ? undefined : metrics[knocker];
      if (knocker !== null && knockerMetric) {
        knockerMetric.knocks += 1;
        if (winners.includes(knocker)) knockerMetric.knockWins += 1;
      }

      /*
       * A redeal is not a result: the house rule says tied lowest hands play
       * the round again, so nothing is banked and nobody is out. The round
       * still folds, because folding is what opens the window that deals the
       * next one.
       */
      if (outcome.reason !== 'redeal') {
        if (format === 'lives') {
          // On a blitz every other live seat drops a life; on a showdown only
          // the seats the scoring put last do.
          const losers =
            outcome.reason === 'blitz'
              ? liveSeats(state.round).filter((seat) => !winners.includes(seat))
              : lowestRankedSeats(outcome.rankings);
          for (const seat of losers) {
            if ((lives[seat] ?? 0) <= 0) continue; // eliminated seats can't lose again
            lives[seat] = Math.max(0, (lives[seat] ?? 0) - 1);
            ctx.fx.emit(Fx.ChipLoss, { seat, livesLeft: lives[seat] });
          }
        } else {
          for (const seat of winners) {
            wins[seat] = (wins[seat] ?? 0) + 1;
            ctx.fx.emit('match.point', { seat, wins: wins[seat] });
          }
        }
      }

      return {
        ...state,
        lives,
        wins,
        metrics,
        folded: true,
        readied: [],
        lastOutcome: outcome,
      };
    },
  };

  moves['next.round'] = {
    validate(state, _seat, payload) {
      if (!state.folded || matchEndResult(state) !== null) {
        return { code: 'no-next-round', message: 'the match is not waiting on another round' };
      }
      if (state.veiled) {
        // An open room deals itself the next round once the table readies up.
        // A veiled one cannot: its deck has to come out of a shuffle ceremony
        // first, so the move waits here and reports what it is waiting for.
        // Dealing from the session rng instead would hand every seat a readable
        // deck halfway through a private match.
        if (!allReadied(state)) {
          return { code: 'awaiting-ready', message: 'the table has not readied up' };
        }
        if (!isVeiledDealPayload(payload)) {
          return {
            code: VEILED_REDEAL_PENDING,
            message: 'a veiled round needs its own shuffled deck',
          };
        }
      }
      return true;
    },
    apply(state, _seat, payload, ctx: MoveCtx) {
      const next = dealBlitzRound(
        {
          config: state.rules,
          seats: state.seats,
          rng: ctx.rng,
          fx: ctx.fx,
          veiled: state.veiled,
          ...(isVeiledDealPayload(payload) ? { deckOrder: payload.deckOrder } : {}),
        },
        knockedOut(state),
      );
      return {
        ...state,
        round: next,
        roundIndex: state.roundIndex + 1,
        folded: false,
        readied: [],
      };
    },
  };

  moves['ready'] = {
    validate(state, seat) {
      if (!state.folded) {
        return { code: 'round-in-play', message: 'the current round is still live' };
      }
      if (state.readied.includes(seat)) {
        return { code: 'already-ready', message: 'you already signalled ready' };
      }
      return true;
    },
    apply(state, seat) {
      return { ...state, readied: [...state.readied, seat] };
    },
  };

  const flow = matchFlow(round, (state, payload) =>
    moves['next.round']!.validate(state, 0 as SeatId, payload),
  );

  return {
    id: 'blitz',
    howToPlay: round.howToPlay,
    configSchema: round.configSchema,
    // The room polls the session state without knowing it holds a match, so the
    // veil pack has to be told where the live round is.
    veil: blitzVeil((state) => (state as BlitzMatchState).round, { redealMove: 'next.round' }),

    setup(ctx) {
      return {
        rules: ctx.config,
        seats: ctx.seats,
        veiled: ctx.veiled === true,
        format,
        target,
        lives: Array.from({ length: ctx.seats }, () => startingLives),
        wins: Array.from({ length: ctx.seats }, () => 0),
        metrics: Array.from({ length: ctx.seats }, () => ({ ...NO_METRICS })),
        roundIndex: 0,
        // Nobody is out on the first deal, whatever an announced `outMask` says:
        // eliminations belong to this match's own bookkeeping from here on.
        round: dealBlitzRound(ctx, []),
        folded: false,
        readied: [],
        lastOutcome: null,
      };
    },

    moves,

    flow,

    playerView(state, seat) {
      return { ...state, round: round.playerView(state.round, seat) };
    },

    end(state) {
      return matchEndResult(state);
    },

    bots: adaptBots(round.bots ?? []),
  };
}

// ---------------------------------------------------------------------------
// flow delegation
// ---------------------------------------------------------------------------

function matchFlow(
  round: GameDef<BlitzState, BlitzConfig>,
  /** the redeal move's own validation, so injection cannot bypass the rules */
  canDealNext: (state: BlitzMatchState, payload: unknown) => true | RuleError,
): GameDef<BlitzMatchState, BlitzConfig>['flow'] {
  const inner = round.flow;

  const livePhase = (state: BlitzMatchState): PhaseState => ({
    ...inner.start(state.round, state.seats),
    round: state.roundIndex + 1,
  });

  return {
    start: livePhase,

    /**
     * The one system event a Blitz match accepts: the next veiled deal. The
     * gate is narrow on purpose — only this move, only while the match is
     * actually waiting for it, and the move's own validation still has to pass,
     * so an injected event cannot deal a round the rules would not.
     */
    canInject(state, _phase, moveId, payload) {
      if (moveId !== 'next.round') {
        return { code: 'not-injectable', message: `blitz does not accept injected ${moveId}` };
      }
      return canDealNext(state, payload);
    },

    legalMoves(state, phase) {
      if (phase.phase === 'round-end' || phase.phase === 'over') return [];
      return inner.legalMoves(state.round, phase);
    },

    legalMovesFor(state, phase, seat) {
      if (phase.phase === 'round-end') {
        // Eliminated seats ready up too. They are still at the table watching,
        // and a round that waited on a seat with no cards would never deal.
        return (phase.actors ?? []).includes(seat) && !state.readied.includes(seat)
          ? [{ id: 'ready' }]
          : [];
      }
      return (inner.legalMovesFor ?? inner.legalMoves)(state.round, phase, seat);
    },

    advance(state, event, seats): FlowAdvance {
      // 1. a settled round banks into the lives before anything else happens
      if (!state.folded && state.round.outcome) {
        return {
          phase: livePhase(state),
          autoMoves: [{ seat: null, move: 'round.fold', reason: 'round complete' }],
        };
      }

      if (state.folded) {
        const ended = matchEndResult(state);
        if (ended) return { phase: overPhase(state), ended };
        // 2. a veiled room waits: the next deck has to come out of a shuffle
        // ceremony, so the room injects `next.round` once it has one.
        if (state.veiled) return { phase: roundEndPhase(state) };

        // 3. open rooms pause in a ready window, then deal the next round
        if (allReadied(state)) {
          return {
            phase: livePhase(state),
            autoMoves: [{ seat: null, move: 'next.round', reason: 'table ready' }],
          };
        }
        return { phase: roundEndPhase(state) };
      }

      // 4. otherwise delegate into the live round (its own end is never final here)
      const delegated = inner.advance(state.round, event, seats);
      return {
        phase: { ...delegated.phase, round: state.roundIndex + 1 },
        ...(delegated.autoMoves ? { autoMoves: delegated.autoMoves } : {}),
      };
    },
  };
}

function adaptBots(policies: readonly BotPolicy<BlitzState>[]): BotPolicy<BlitzMatchState>[] {
  return policies.map((policy) => ({
    id: policy.id,
    label: policy.label,
    tier: policy.tier,
    persona: policy.persona,
    chooseMove(view, seat, legal, rng, ctx) {
      if (view.folded) return legal.find((move) => move.id === 'ready') ?? null;
      return policy.chooseMove(view.round, seat, legal, rng, ctx);
    },
  }));
}

// ---------------------------------------------------------------------------
// match bookkeeping
// ---------------------------------------------------------------------------

function allReadied(state: BlitzMatchState): boolean {
  for (let seat = 0; seat < state.seats; seat++) {
    if (!state.readied.includes(seat)) return false;
  }
  return true;
}

/** Seats whose last life has gone. They are dealt nothing and never act again. */
function knockedOut(state: BlitzMatchState): SeatId[] {
  if (state.format !== 'lives') return [];
  return state.lives.flatMap((lives, seat) => (lives <= 0 ? [seat] : []));
}

/**
 * The match is over between rounds or not at all.
 *
 * Gating on `folded` is not just an optimisation: lives and wins only ever move
 * inside `round.fold`, and a one-seat table would otherwise read as won before
 * a card was dealt.
 */
export function matchEndResult(state: BlitzMatchState): MatchResult | null {
  if (!state.folded) return null;

  if (state.format === 'lives') {
    const standing = state.lives.flatMap((lives, seat) => (lives > 0 ? [seat] : []));
    if (standing.length > 1) return null;
    const ranked = rankMatch(state);
    return standing.length === 1
      ? { ...ranked, winner: standing[0]!, reason: 'last player standing' }
      : // the final seats died in the same fold (tieLowest 'both') — a drawn match
        { ...ranked, winner: null, reason: 'simultaneous knockout' };
  }

  if (!state.wins.some((wins) => wins >= state.target)) return null;
  return { ...rankMatch(state), reason: `first to ${state.target}` };
}

/**
 * The whole table, ranked by the thing the format is played for, with every
 * seat's own numbers attached.
 *
 * The podium draws one plaque per ranking and reads its figures out of
 * `detail`, so this is what decides whether the end screen can tell you what
 * happened. A room used to hand it a single round's hand values, which is why
 * it could only show zeroes.
 */
function rankMatch(state: BlitzMatchState): { winner: SeatId | null; rankings: MatchResultRank[] } {
  const values = state.format === 'lives' ? state.lives : state.wins;
  const ordered = values
    .map((value, seat) => ({ seat, value }))
    .sort((left, right) => right.value - left.value || left.seat - right.seat);

  let priorValue: number | null = null;
  let priorRank = 0;
  const rankings: MatchResultRank[] = ordered.map(({ seat, value }, index) => {
    if (value !== priorValue) priorRank = index + 1;
    priorValue = value;
    const metrics = state.metrics[seat] ?? NO_METRICS;
    return {
      seat,
      rank: priorRank,
      detail:
        state.format === 'lives'
          ? { livesLeft: value, ...metrics }
          : { roundWins: value, ...metrics },
    };
  });

  const firsts = rankings.filter((entry) => entry.rank === 1);
  return { winner: firsts.length === 1 ? firsts[0]!.seat : null, rankings };
}

function roundEndPhase(state: BlitzMatchState): PhaseState {
  const waiting: SeatId[] = [];
  for (let seat = 0; seat < state.seats; seat++) {
    if (!state.readied.includes(seat)) waiting.push(seat);
  }
  return {
    phase: 'round-end',
    actor: waiting[0] ?? null,
    actors: waiting,
    round: state.roundIndex + 1,
    label: 'round end',
  };
}

function overPhase(state: BlitzMatchState): PhaseState {
  return { phase: 'over', actor: null, round: state.roundIndex + 1 };
}
