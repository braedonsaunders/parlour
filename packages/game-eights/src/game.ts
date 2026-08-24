import {
  Fx,
  type AutoMove,
  type BotPolicy,
  type CardId,
  type Flow,
  type GameDef,
  type LegalMove,
  type MatchResult,
  type MatchResultRank,
  type Move,
  type MoveCtx,
  type PhaseState,
  type RuleError,
  type SeatId,
} from '@parlour/engine';
import { EIGHTS_SUITS, isEightsSuit, type EightsSuit } from './cards';
import { eightsConfig, type EightsRules } from './config';
import { eightsHowToPlay } from './howto';
import {
  EIGHTS_MAX_SEATS,
  EIGHTS_MIN_SEATS,
  FORCED_DRAW_DELAY_MS,
  canDraw,
  canPlay,
  canStack,
  chooseSuitInRound,
  dealRound,
  drawCards,
  handOf,
  hasPlayable,
  nextSeat,
  playCardInRound,
  playableCards,
  settleRound,
} from './round';
import type { EightsRound, EightsState } from './state';

export const GAME_ID = 'eights';

function error(code: string, message: string): RuleError {
  return { code, message };
}

function payloadCard(payload: unknown): CardId | null {
  const card = (payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' ? card : null;
}

function payloadSuit(payload: unknown): EightsSuit | null {
  const suit = (payload as { suit?: unknown } | undefined)?.suit;
  return isEightsSuit(suit) ? suit : null;
}

/** Every player move ends the same way: close the round if it is actually over. */
function settled(state: EightsState, round: EightsRound, ctx: MoveCtx): EightsState {
  return { ...state, round: settleRound(round, state.rules, ctx.fx) };
}

/** Shared gate for the four moves that only make sense on a live round. */
function liveTurn(state: EightsState, seat: SeatId): true | RuleError {
  if (state.folded) return error('round-over', 'the round is over — ready up for the next deal');
  if (state.round.outcome) return error('round-over', 'this round has already been decided');
  if (state.round.awaitingSuit !== null) {
    return error('suit-required', 'the eight on the pile still needs a suit');
  }
  if (state.round.turn !== seat) return error('not-your-turn', 'seat is not taking this turn');
  return true;
}

// ---------------------------------------------------------------------------
// moves
// ---------------------------------------------------------------------------

const playCard: Move<EightsState> = {
  validate(state, seat, payload) {
    const gate = liveTurn(state, seat);
    if (gate !== true) return gate;
    const card = payloadCard(payload);
    if (!card) return error('bad-payload', 'expected {card}');
    if (!handOf(state.round, seat).includes(card)) {
      return error('not-in-hand', `${card} is not in the hand`);
    }
    if (state.round.drawnCard !== null && card !== state.round.drawnCard) {
      return error('play-the-drawn-card', 'only the card you drew can be played now');
    }
    return canPlay(state.round, state.rules, card)
      ? true
      : error('card-not-playable', `${card} cannot be played on this pile`);
  },
  apply(state, seat, payload, ctx) {
    const card = payloadCard(payload);
    if (!card) throw new Error('playCard apply requires a card');
    return settled(state, playCardInRound(state.round, state.rules, seat, card, ctx.fx), ctx);
  },
};

const draw: Move<EightsState> = {
  validate(state, seat) {
    const gate = liveTurn(state, seat);
    if (gate !== true) return gate;
    if (state.round.drawnCard !== null) {
      return error('already-drew', 'play the card you drew, or pass');
    }
    return canDraw(state.round) || state.round.pendingDraw > 0
      ? true
      : error('nothing-to-draw', 'the stock and the pile are both spent');
  },
  apply(state, seat, _payload, ctx) {
    const { round, rules } = state;
    const forced = round.pendingDraw > 0;
    // Draw-until-playable is bounded by the cards in play, so a pile nothing
    // matches still terminates instead of spinning.
    const ceiling = round.stock.length + round.discard.length;
    const count = forced ? round.pendingDraw : rules.drawUntilPlayable ? Math.max(1, ceiling) : 1;
    const before = handOf(round, seat).length;
    const drawn = drawCards(round, seat, count, ctx.fx, ctx.rng, {
      delayMs: forced ? FORCED_DRAW_DELAY_MS : 0,
      stopWhen: forced ? undefined : (card) => canPlay(round, rules, card),
      // A pickup the seat did not choose is the one worth counting out loud.
      announce: forced ? 'penalty' : undefined,
    });
    const cleared: EightsRound = { ...drawn, pendingDraw: 0, drawnCard: null };
    const taken =
      handOf(cleared, seat).length > before ? (handOf(cleared, seat).at(-1) ?? null) : null;

    // A pickup costs the turn. A voluntary draw that lands something playable
    // keeps it: the card you just drew is yours to use.
    if (!forced && taken !== null && canPlay(cleared, rules, taken)) {
      ctx.fx.emit('eights.drew-playable', { seat, card: taken });
      return settled(state, { ...cleared, drawnCard: taken }, ctx);
    }

    const turn = nextSeat(cleared, seat);
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, 80);
    return settled(state, { ...cleared, turn }, ctx);
  },
};

/**
 * Give up the turn. Either you are declining the card you just drew, or the
 * stock is spent and nothing in your hand will go on the pile.
 */
const pass: Move<EightsState> = {
  validate(state, seat) {
    const gate = liveTurn(state, seat);
    if (gate !== true) return gate;
    const { round, rules } = state;
    if (round.drawnCard !== null) {
      return rules.forcePlay && canPlay(round, rules, round.drawnCard)
        ? error('force-play', 'the table requires you to play that card')
        : true;
    }
    if (hasPlayable(round, rules, seat)) return error('play-a-card', 'you have a legal play');
    return canDraw(round) || round.pendingDraw > 0
      ? error('draw-first', 'draw before giving up the turn')
      : true;
  },
  apply(state, seat, _payload, ctx) {
    const turn = nextSeat(state.round, seat);
    ctx.fx.emit('eights.pass', { seat });
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, 80);
    return settled(state, { ...state.round, drawnCard: null, turn }, ctx);
  },
};

const chooseSuit: Move<EightsState> = {
  validate(state, seat, payload) {
    if (state.folded) return error('round-over', 'the round is over');
    if (state.round.awaitingSuit !== seat) {
      return error('suit-not-awaited', 'seat is not naming a suit');
    }
    return payloadSuit(payload) ? true : error('bad-suit', 'expected a suit');
  },
  apply(state, seat, payload, ctx) {
    const suit = payloadSuit(payload);
    if (!suit) throw new Error('chooseSuit apply requires a suit');
    return settled(state, chooseSuitInRound(state.round, seat, suit, ctx.fx), ctx);
  },
};

const roundFold: Move<EightsState> = {
  validate(state) {
    if (!state.folded && state.round.outcome) return true;
    return error('nothing-to-fold', 'the round on the table has no outcome yet');
  },
  apply(state, _seat, _payload, ctx) {
    const outcome = state.round.outcome;
    if (!outcome) throw new Error('round.fold apply requires a settled round');
    const scores = [...state.scores];
    const roundsWon = [...state.roundsWon];
    scores[outcome.winner] = (scores[outcome.winner] ?? 0) + outcome.points;
    roundsWon[outcome.winner] = (roundsWon[outcome.winner] ?? 0) + 1;
    ctx.fx.emit('eights.score', {
      seat: outcome.winner,
      points: outcome.points,
      total: scores[outcome.winner],
      reason: outcome.reason,
    });
    for (let seat = 0; seat < state.seats; seat++) {
      ctx.fx.emit('eights.standings', { seat, total: scores[seat] }, 200 + seat * 120);
    }
    return { ...state, scores, roundsWon, folded: true, readied: [], lastOutcome: outcome };
  },
};

const nextRound: Move<EightsState> = {
  validate(state) {
    if (state.folded && matchEndResult(state) === null) return true;
    return error('no-next-round', 'the match is not waiting on another deal');
  },
  apply(state, _seat, _payload, ctx) {
    const dealer = ((state.dealer + 1) % state.seats) as SeatId;
    const round = dealRound(
      { config: state.rules, seats: state.seats, rng: ctx.rng, fx: ctx.fx },
      dealer,
    );
    return {
      ...state,
      round,
      roundIndex: state.roundIndex + 1,
      dealer,
      folded: false,
      readied: [],
    };
  },
};

const ready: Move<EightsState> = {
  validate(state, seat) {
    if (!state.folded) return error('round-in-play', 'the round on the table is still live');
    if (state.readied.includes(seat)) return error('already-ready', 'you already signalled ready');
    return true;
  },
  apply(state, seat) {
    return { ...state, readied: [...state.readied, seat] };
  },
};

// ---------------------------------------------------------------------------
// flow
// ---------------------------------------------------------------------------

function allReadied(state: EightsState): boolean {
  for (let seat = 0; seat < state.seats; seat++) {
    if (!state.readied.includes(seat)) return false;
  }
  return true;
}

function livePhase(state: EightsState): PhaseState {
  const round = state.roundIndex + 1;
  if (state.round.awaitingSuit !== null) {
    return { phase: 'choose-suit', actor: state.round.awaitingSuit, round, label: 'name a suit' };
  }
  return { phase: 'play', actor: state.round.turn, round };
}

function roundEndPhase(state: EightsState): PhaseState {
  const waiting: SeatId[] = [];
  for (let seat = 0; seat < state.seats; seat++) {
    if (!state.readied.includes(seat)) waiting.push(seat);
  }
  return {
    phase: 'round-end',
    actor: waiting[0] ?? null,
    actors: waiting,
    round: state.roundIndex + 1,
    label: 'round over',
  };
}

function overPhase(state: EightsState): PhaseState {
  return { phase: 'over', actor: null, round: state.roundIndex + 1 };
}

function phaseFor(state: EightsState): PhaseState {
  if (matchEndResult(state)) return overPhase(state);
  if (state.folded) return roundEndPhase(state);
  return livePhase(state);
}

function legalMoves(state: EightsState, phase: PhaseState): LegalMove[] {
  if (phase.phase === 'over' || phase.phase === 'round-end') return [];
  if (phase.phase === 'choose-suit') {
    return EIGHTS_SUITS.map((suit) => ({ id: 'chooseSuit', payload: { suit } }));
  }
  const { round, rules } = state;
  const seat = round.turn;

  // Mid-turn after a draw: the drawn card is the only card on offer.
  if (round.drawnCard !== null) {
    const playable = canPlay(round, rules, round.drawnCard);
    return [
      ...(playable ? [{ id: 'playCard', payload: { card: round.drawnCard } }] : []),
      ...(playable && rules.forcePlay ? [] : [{ id: 'pass' }]),
    ];
  }

  const plays = playableCards(round, rules, seat).map((card) => ({
    id: 'playCard',
    payload: { card },
  }));
  const drawable = canDraw(round) || round.pendingDraw > 0;
  return [
    ...plays,
    ...(drawable ? [{ id: 'draw' }] : []),
    ...(plays.length === 0 && !drawable ? [{ id: 'pass', hint: 'nothing to play' }] : []),
  ];
}

/**
 * An unanswerable pickup is not a decision, so the flow takes it rather than
 * parking the table behind a draw button nobody can decline.
 */
function forcedPickup(state: EightsState, phase: PhaseState): AutoMove | null {
  if (phase.phase !== 'play' || phase.actor === null) return null;
  const { round, rules } = state;
  if (round.pendingDraw <= 0 || round.drawnCard !== null) return null;
  if (handOf(round, phase.actor).some((card) => canStack(round, rules, card))) return null;
  return { seat: phase.actor, move: 'draw', reason: 'forced-pickup' };
}

const flow: Flow<EightsState> = {
  start(state) {
    return phaseFor(state);
  },

  legalMoves(state, phase) {
    return legalMoves(state, phase);
  },

  legalMovesFor(state, phase, seat) {
    if (phase.phase === 'round-end') {
      return (phase.actors ?? []).includes(seat) && !state.readied.includes(seat)
        ? [{ id: 'ready' }]
        : [];
    }
    return phase.actor === seat ? legalMoves(state, phase) : [];
  },

  advance(state) {
    // 1. a settled round banks its points before anything else happens
    if (!state.folded && state.round.outcome) {
      return {
        phase: livePhase(state),
        autoMoves: [{ seat: null, move: 'round.fold', reason: 'round complete' }],
      };
    }

    if (state.folded) {
      const ended = matchEndResult(state);
      if (ended) return { phase: overPhase(state), ended };
      if (allReadied(state)) {
        return {
          phase: livePhase(state),
          autoMoves: [{ seat: null, move: 'next.round', reason: 'table ready' }],
        };
      }
      return { phase: roundEndPhase(state) };
    }

    const phase = livePhase(state);
    const auto = forcedPickup(state, phase);
    return auto ? { phase, autoMoves: [auto] } : { phase };
  },
};

// ---------------------------------------------------------------------------
// match bookkeeping
// ---------------------------------------------------------------------------

function buildRankings(state: EightsState): MatchResultRank[] {
  return state.scores
    .map((score, seat) => ({ score, seat }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat)
    .map(({ seat, score }, index) => ({
      seat,
      rank: index + 1,
      detail: { score, roundsWon: state.roundsWon[seat] ?? 0 },
    }));
}

/**
 * The match ends when a sole leader crosses the target. A tie at the top keeps
 * dealing — nobody wants a crown they had to share by accident.
 */
export function matchEndResult(state: EightsState): MatchResult | null {
  if (!state.folded) return null;
  let leader = 0;
  for (let seat = 1; seat < state.seats; seat++) {
    if ((state.scores[seat] ?? 0) > (state.scores[leader] ?? 0)) leader = seat;
  }
  const best = state.scores[leader] ?? 0;
  if (best < state.rules.targetScore) return null;
  if (state.scores.filter((score) => score === best).length > 1) return null;
  return { winner: leader as SeatId, rankings: buildRankings(state), reason: 'eights-match' };
}

// ---------------------------------------------------------------------------
// the def
// ---------------------------------------------------------------------------

export interface EightsDefOptions {
  bots?: readonly BotPolicy<EightsState>[];
}

export function createEightsDef(options: EightsDefOptions = {}): GameDef<EightsState, EightsRules> {
  return {
    id: GAME_ID,
    howToPlay: eightsHowToPlay,
    configSchema: eightsConfig,

    setup(ctx) {
      const { config, seats } = ctx;
      if (!Number.isInteger(seats) || seats < EIGHTS_MIN_SEATS || seats > EIGHTS_MAX_SEATS) {
        throw new Error(`eights requires ${EIGHTS_MIN_SEATS}–${EIGHTS_MAX_SEATS} seats`);
      }
      const dealer: SeatId = 0;
      return {
        seats,
        rules: config,
        scores: Array.from({ length: seats }, () => 0),
        roundsWon: Array.from({ length: seats }, () => 0),
        roundIndex: 0,
        dealer,
        round: dealRound({ config, seats, rng: ctx.rng, fx: ctx.fx }, dealer),
        folded: false,
        readied: [],
        lastOutcome: null,
      };
    },

    moves: {
      playCard,
      draw,
      pass,
      chooseSuit,
      ready,
      'round.fold': roundFold,
      'next.round': nextRound,
    },

    flow,

    playerView(state, seat) {
      return {
        ...state,
        round: {
          ...state.round,
          hands: state.round.hands.map((cards, index) =>
            index === seat ? cards.slice() : cards.map(() => '??'),
          ),
          stock: state.round.stock.map(() => '??'),
        },
      };
    },

    end: matchEndResult,

    bots: options.bots ?? [],
  };
}
