import {
  isVeiledDealPayload,
  VEILED_REDEAL_PENDING,
  type BotPolicy,
  type FlowAdvance,
  type GameDef,
  type Move,
  type MoveCtx,
  type PhaseState,
  type RuleError,
  type SeatId,
} from '@parlour/engine';
import { BOX_BONUS_POINTS, type GinConfig } from './config';
import { createGinHandDef, dealHand, ginVeil } from './rules';
import { scoreHand } from './score';
import type { GinMatchState, GinState } from './state';

/**
 * The match as one deterministic session. Gin is a race to a point target
 * across many hands with an alternating dealer — and friend rooms run on a
 * single-session P2P authority, so the match layer lives inside the game def:
 * every hand is a pure `dealHand` fold, `hand.fold` banks the points, seats
 * ready up during the hand-end window, and `next.hand` deals again from the
 * per-event rng stream (replay-stable like everything else).
 *
 * A veiled match deals every hand the same way it deals the first: the room
 * runs a fresh shuffle ceremony and hands the deck to `next.hand`, which is why
 * the move requires one rather than falling back to the session rng. It used to
 * refuse to deal at all while veiled, so a private match ended after one hand.
 */

/** Hand-level moves re-exposed verbatim by the match def. */
const HAND_MOVES = [
  'option.take',
  'option.pass',
  'draw.stock',
  'draw.discard',
  'discard',
  'knock',
  'showdown.open',
  'showdown',
  'hand.dead',
] as const;

export interface GinMatchDefOptions {
  /** hand-level bot policies, adapted to the match view */
  bots?: readonly BotPolicy<GinState>[];
}

export function createGinMatchDef(
  options: GinMatchDefOptions = {},
): GameDef<GinMatchState, GinConfig> {
  const hand = createGinHandDef({ bots: options.bots });

  const moves: Record<string, Move<GinMatchState>> = {};
  for (const moveId of HAND_MOVES) {
    const inner = hand.moves[moveId];
    if (!inner) throw new Error(`gin match: hand def is missing move ${moveId}`);
    moves[moveId] = {
      validate(state, seat, payload) {
        return inner.validate(state.hand, seat, payload);
      },
      apply(state, seat, payload, ctx) {
        return { ...state, hand: inner.apply(state.hand, seat, payload, ctx) };
      },
    };
  }

  moves['hand.fold'] = {
    validate(state) {
      if (!state.folded && state.hand.outcome) return true;
      return { code: 'nothing-to-fold', message: 'the current hand has no outcome' };
    },
    apply(state, _seat, _payload, ctx) {
      const outcome = state.hand.outcome ?? scoreHand(state.hand);
      const scores = [...state.scores];
      const handsWon = [...state.handsWon];
      if (outcome.scorer !== null) {
        const bonus = state.rules.boxBonus ? BOX_BONUS_POINTS : 0;
        const seat = outcome.scorer;
        scores[seat] = (scores[seat] ?? 0) + outcome.points + bonus;
        handsWon[seat] = (handsWon[seat] ?? 0) + 1;
        ctx.fx.emit('gin.score', {
          seat: outcome.scorer,
          points: outcome.points + bonus,
          total: scores[outcome.scorer],
        });
      }
      for (let seat = 0; seat < state.seats; seat++) {
        ctx.fx.emit('gin.standings', { seat, total: scores[seat] }, 200 + seat * 120);
      }
      return {
        ...state,
        scores,
        handsWon,
        folded: true,
        readied: [],
        lastOutcome: outcome,
      };
    },
  };

  moves['next.hand'] = {
    validate(state, _seat, payload) {
      if (!state.folded || matchEndResult(state) !== null) {
        return { code: 'no-next-hand', message: 'the match is not waiting on another hand' };
      }
      if (state.veiled) {
        // An open room deals the next hand for itself once the table readies
        // up. A veiled one cannot: its deck has to be shuffled by a ceremony
        // first, so the move waits here and reports what it is waiting for.
        // Dealing from the session rng instead would hand every seat a readable
        // deck halfway through a private match.
        if (!allReadied(state)) {
          return { code: 'awaiting-ready', message: 'the table has not readied up' };
        }
        if (!isVeiledDealPayload(payload)) {
          return {
            code: VEILED_REDEAL_PENDING,
            message: 'a veiled hand needs its own shuffled deck',
          };
        }
      }
      return true;
    },
    apply(state, _seat, payload, ctx: MoveCtx) {
      const next = dealHand(
        {
          config: state.rules,
          seats: state.seats,
          rng: ctx.rng,
          fx: ctx.fx,
          veiled: state.veiled,
          deckOrder: isVeiledDealPayload(payload) ? payload.deckOrder : undefined,
        },
        ((state.dealer + 1) % state.seats) as SeatId,
      );
      return {
        ...state,
        hand: next,
        handIndex: state.handIndex + 1,
        dealer: next.dealer,
        folded: false,
        readied: [],
      };
    },
  };

  moves['ready'] = {
    validate(state, seat) {
      if (!state.folded) {
        return { code: 'hand-in-play', message: 'the current hand is still live' };
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

  const flow = matchFlow(hand, (state, payload) =>
    moves['next.hand']!.validate(state, 0 as SeatId, payload),
  );

  return {
    id: 'gin',
    howToPlay: hand.howToPlay,
    configSchema: hand.configSchema,
    veil: ginVeil,

    setup(ctx) {
      const first = dealHand(ctx, 0);
      return {
        rules: ctx.config,
        seats: ctx.seats,
        veiled: ctx.veiled === true,
        scores: Array.from({ length: ctx.seats }, () => 0),
        handsWon: Array.from({ length: ctx.seats }, () => 0),
        handIndex: 0,
        dealer: first.dealer,
        hand: first,
        folded: false,
        readied: [],
        lastOutcome: null,
      };
    },

    moves,

    flow,

    playerView(state, seat) {
      return {
        ...state,
        hand: hand.playerView(state.hand, seat),
      };
    },

    end(state) {
      return matchEndResult(state);
    },

    bots: options.bots ? adaptBots(options.bots) : [],
  };
}

// ---------------------------------------------------------------------------
// flow delegation
// ---------------------------------------------------------------------------

function matchFlow(
  hand: GameDef<GinState, GinConfig>,
  /** the redeal move's own validation, so injection cannot bypass the rules */
  canDealNext: (state: GinMatchState, payload: unknown) => true | RuleError,
): GameDef<GinMatchState, GinConfig>['flow'] {
  const inner = hand.flow;

  /** The hand def derives its present phase purely from state. */
  const livePhase = (state: GinMatchState): PhaseState => ({
    ...inner.start(state.hand, state.seats),
    round: state.handIndex + 1,
  });

  return {
    start: liveStart,

    /**
     * The one system event a gin match accepts: the next veiled deal.
     *
     * An open match deals itself the next hand, so nothing is injected. A
     * veiled one cannot — its deck has to come out of a shuffle ceremony the
     * room runs — so the host injects the move with that deck. The gate is
     * narrow on purpose: only this move, only while the match is actually
     * waiting for it, and the move's own validation still has to pass, so an
     * injected event cannot deal a hand the rules would not.
     */
    canInject(state, _phase, moveId, payload) {
      if (moveId !== 'next.hand') {
        return { code: 'not-injectable', message: `gin does not accept injected ${moveId}` };
      }
      return canDealNext(state, payload);
    },

    legalMoves(state, phase) {
      if (phase.phase === 'hand-end' || phase.phase === 'over') return [];
      return inner.legalMoves(state.hand, phase);
    },

    legalMovesFor(state, phase, seat) {
      if (phase.phase === 'hand-end') {
        return (phase.actors ?? []).includes(seat) && !state.readied.includes(seat)
          ? [{ id: 'ready' }]
          : [];
      }
      return (inner.legalMovesFor ?? inner.legalMoves)(state.hand, phase, seat);
    },

    advance(state, event, seats): FlowAdvance {
      // 1. a settled hand folds into the scores before anything else happens
      if (!state.folded && state.hand.outcome) {
        return {
          phase: livePhase(state),
          autoMoves: [{ seat: null, move: 'hand.fold', reason: 'hand complete' }],
        };
      }

      if (state.folded) {
        const ended = matchEndResult(state);
        if (ended) return { phase: overPhase(state), ended };
        // 2. a veiled room waits: the next deck has to come out of a shuffle
        // ceremony, so the room injects `next.hand` once it has one. Auto-
        // playing it here would deal from the session rng and unveil the match.
        if (state.veiled) return { phase: handEndPhase(state) };

        // 3. open rooms pause in a ready window, then deal the next hand
        if (allReadied(state)) {
          return {
            phase: livePhase(state),
            autoMoves: [{ seat: null, move: 'next.hand', reason: 'table ready' }],
          };
        }
        return { phase: handEndPhase(state) };
      }

      // 4. otherwise delegate into the live hand (its own end is never final here)
      const delegated = inner.advance(state.hand, event, seats);
      return {
        phase: { ...delegated.phase, round: state.handIndex + 1 },
        ...(delegated.autoMoves ? { autoMoves: delegated.autoMoves } : {}),
      };
    },
  };

  function liveStart(state: GinMatchState): PhaseState {
    return livePhase(state);
  }
}

function adaptBots(policies: readonly BotPolicy<GinState>[]): BotPolicy<GinMatchState>[] {
  return policies.map((policy) => ({
    id: policy.id,
    label: policy.label,
    tier: policy.tier,
    persona: policy.persona,
    chooseMove(view, seat, legal, rng, ctx) {
      if (view.folded) return legal.find((move) => move.id === 'ready') ?? null;
      return policy.chooseMove(view.hand, seat, legal, rng, ctx);
    },
  }));
}

// ---------------------------------------------------------------------------
// match bookkeeping
// ---------------------------------------------------------------------------

function allReadied(state: GinMatchState): boolean {
  for (let seat = 0; seat < state.seats; seat++) {
    if (!state.readied.includes(seat)) return false;
  }
  return true;
}

/**
 * Open rooms: the match ends when a sole leader crosses the target — ties keep
 * playing. Veiled rooms end with their single hand's result once folded.
 */
export function matchEndResult(state: GinMatchState) {
  // A veiled match used to end the moment its first hand folded, because a
  // second deck could not be shuffled mid-session. It can now, so a private
  // match is played to the same point target as any other.
  let leader = 0;
  for (let seat = 1; seat < state.seats; seat++) {
    if ((state.scores[seat] ?? 0) > (state.scores[leader] ?? 0)) leader = seat;
  }
  if ((state.scores[leader] ?? 0) < state.rules.matchTarget) return null;
  const tied = state.scores.filter((score) => score === state.scores[leader]).length;
  if (tied > 1) return null;
  return {
    winner: leader as SeatId,
    rankings: buildRankings(state),
    reason: 'gin-match',
  };
}

function buildRankings(state: GinMatchState) {
  return state.scores
    .map((score, seat) => ({ score, seat }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat)
    .map(({ seat, score }, index) => ({
      seat,
      rank: index + 1,
      detail: { score, handsWon: state.handsWon[seat] ?? 0 },
    }));
}

function handEndPhase(state: GinMatchState): PhaseState {
  const waiting: SeatId[] = [];
  for (let seat = 0; seat < state.seats; seat++) {
    if (!state.readied.includes(seat)) waiting.push(seat);
  }
  return {
    phase: 'hand-end',
    actor: waiting[0] ?? null,
    actors: waiting,
    round: state.handIndex + 1,
    label: 'hand end',
  };
}

function overPhase(state: GinMatchState): PhaseState {
  return { phase: 'over', actor: null, round: state.handIndex + 1 };
}
