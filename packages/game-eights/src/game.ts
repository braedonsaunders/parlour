import {
  advanceSeat,
  Fx,
  VEILED_REDEAL_PENDING,
  isVeiledDealPayload,
  veilSupport,
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
  recycleSpentPile,
} from '@parlour/engine';
import {
  EIGHTS_SUITS,
  WILD_RANK,
  eightsDeck,
  hasHiddenCard,
  isEightsSuit,
  isHiddenCard,
  rankOf,
  type EightsSuit,
} from './cards';
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
  roundIsOver,
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
  validate(state, seat, _payload, ctx) {
    const gate = liveTurn(state, seat);
    if (gate !== true) return gate;
    if (state.round.drawnCard !== null) {
      return error('already-drew', 'play the card you drew, or pass');
    }
    // Turning a face-up discard back into the stock would make every remaining
    // draw readable by the whole table, so a veiled room re-veils it in a fresh
    // epoch first and the runtime hands the recycled cards back through `ctx`.
    if (
      state.veiled &&
      state.round.stock.length === 0 &&
      state.round.discard.slice(1).some((card) => !isHiddenCard(card)) &&
      !ctx?.recycle
    ) {
      return error(
        'stock-not-reveiled',
        'the discard pile must be re-veiled before it becomes the stock',
      );
    }
    // An exchange that no longer fits the pile — the board moved while its
    // ceremony ran — is refused cleanly so the sender can cut a fresh one.
    if (
      ctx?.recycle &&
      state.round.stock.length === 0 &&
      recycleSpentPile(state.round.stock, state.round.discard, ctx.recycle) === null
    ) {
      return error('stale-recycle', 'the re-veiled exchange no longer matches the pile');
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
      recycle: ctx.recycle,
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
  validate(state, _seat, payload) {
    if (!state.folded || matchEndResult(state) !== null) {
      return error('no-next-round', 'the match is not waiting on another deal');
    }
    // An open room deals the next round from the session rng. A veiled one
    // cannot: that order replays for every seat, so it waits for a deck the
    // room shuffled behind the ceremony.
    if (state.veiled && !isVeiledDealPayload(payload)) {
      return { code: VEILED_REDEAL_PENDING, message: 'a veiled round needs its own shuffled deck' };
    }
    return true;
  },
  apply(state, _seat, payload, ctx) {
    const dealer = advanceSeat(state.dealer, state.seats);
    const round = dealRound(
      {
        config: state.rules,
        seats: state.seats,
        rng: ctx.rng,
        fx: ctx.fx,
        deckOrder: isVeiledDealPayload(payload) ? payload.deckOrder : undefined,
      },
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

/**
 * A seat opening its hand at the end of a veiled round.
 *
 * The cards themselves are decrypted by the reveal machinery in the runtime
 * before this ever runs; all this move does is refuse to be the seat that
 * settles the round while it is still holding handles.
 */
const roundOpen: Move<EightsState> = {
  validate(state, seat) {
    if (!state.veiled) return error('not-veiled', 'this round has nothing to open');
    return hasHiddenCard(handOf(state.round, seat))
      ? error('hand-not-opened', 'the whole hand must be opened')
      : true;
  },
  apply(state, seat, _payload, ctx) {
    ctx.fx.emit('veil.open', { seat, cards: handOf(state.round, seat).length });
    // Opening the last closed hand is what lets the round finally add up.
    return { ...state, round: settleRound(state.round, state.rules, ctx.fx) };
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

/**
 * Seats still holding cards nobody can read.
 *
 * A round is scored on what everyone is left holding, so a veiled round cannot
 * settle until every closed hand has been opened. The room drives that through
 * the phase below, one seat at a time, exactly as a gin showdown does.
 */
function closedSeats(state: EightsState): SeatId[] {
  if (!state.veiled) return [];
  return state.round.hands.flatMap((hand, seat) => (hasHiddenCard(hand) ? [seat as SeatId] : []));
}

function revealPhase(closed: readonly SeatId[], state: EightsState): PhaseState {
  return {
    phase: 'round-reveal',
    actor: closed[0] as SeatId,
    actors: closed,
    round: state.roundIndex + 1,
    label: 'show your hand',
  };
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

  /**
   * The one system event a crazy eights match accepts: the next veiled deal.
   * The move's own validation still runs, so an injected event cannot deal a
   * round the rules would refuse.
   */
  canInject(state, _phase, moveId, payload) {
    if (moveId !== 'next.round') {
      return { code: 'not-injectable', message: `eights does not accept injected ${moveId}` };
    }
    return nextRound.validate(state, state.dealer, payload);
  },

  legalMoves(state, phase) {
    return legalMoves(state, phase);
  },

  legalMovesFor(state, phase, seat) {
    if (phase.phase === 'round-reveal') {
      return (phase.actors ?? []).includes(seat) ? [{ id: 'round.open' }] : [];
    }
    if (phase.phase === 'round-end') {
      return (phase.actors ?? []).includes(seat) && !state.readied.includes(seat)
        ? [{ id: 'ready' }]
        : [];
    }
    return phase.actor === seat ? legalMoves(state, phase) : [];
  },

  advance(state) {
    // 0. a veiled round that has run its course cannot be scored until every
    //    seat still holding cards has opened them
    if (!state.folded && !state.round.outcome && roundIsOver(state.round, state.rules)) {
      const closed = closedSeats(state);
      if (closed.length > 0) return { phase: revealPhase(closed, state) };
    }

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
        // A veiled room waits: its next deck comes out of a ceremony the room
        // runs, and arrives as an injected `next.round`.
        if (state.veiled) return { phase: roundEndPhase(state) };
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

    /*
     * Veil.
     *
     * Hands are dealt face down, then the room keeps opening cards in public
     * until it turns up something that is not an eight — a wild face up would
     * ask the pile a question before anyone has been given the chance to
     * answer it, so the starter has to be a card the table can already read.
     *
     * A match is many deals, and one ceremony covers one deck, so `next.round`
     * is named as the redeal move: the room runs a fresh ceremony and injects
     * the deck rather than the game reaching for the session rng, which every
     * seat could replay.
     */
    veil: veilSupport({
      deck: eightsDeck,
      handSize: (config) => (config as EightsRules).handSize,
      publicSetup: (opened) =>
        opened.some((card) => !isHiddenCard(card) && rankOf(card) !== WILD_RANK),
      redealMove: 'next.round',
    }),

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
        round: dealRound(
          { config, seats, rng: ctx.rng, fx: ctx.fx, deckOrder: ctx.deckOrder },
          dealer,
        ),
        veiled: ctx.veiled === true,
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
      'round.open': roundOpen,
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
