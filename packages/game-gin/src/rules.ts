import {
  Fx,
  addTo,
  hasVeiledCard,
  removeFrom,
  shuffledIds,
  stdDeck,
  veilSupport,
  type BotPolicy,
  type CardId,
  type FxEmitter,
  type GameDef,
  type LegalMove,
  type Move,
  type PhaseState,
  type Rng,
  type SeatId,
} from '@parlour/engine';
import { ginConfigSchema, type GinConfig } from './config';
import { ginHowToPlay } from './howto';
import { deadwoodOf } from './melds';
import { scoreHand, HAND_SIZE } from './score';
import type { GinState, Pickup } from './state';

const DECK = stdDeck();
export const GIN_HAND_SIZE = HAND_SIZE;
/** A hand goes dead once only this many stock cards remain. */
export const DEAD_STOCK_SIZE = 2;
/** Consecutive pile-only turns before the hand is declared dead. */
export const MAX_QUIET_TURNS = 15;
export const DEAL_STAGGER_MS = 60;

/**
 * Veil, inherited: ten cards a seat, then one card the room turns face up in
 * public to seed the discard pile.
 */
export const ginVeil = veilSupport({
  deck: DECK,
  handSize: HAND_SIZE,
  publicSetup: 'one',
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function other(seat: SeatId): SeatId {
  return seat === 0 ? 1 : 0;
}

function nonDealer(state: GinState): SeatId {
  return other(state.dealer);
}

/**
 * Legality of a knock stays public under Veil (card counts only); whether the
 * deadwood claim is honest is settled by `validate` against the openings the
 * move carried — a bluff is rejected before it ever reaches the log.
 */
function knockLegality(state: GinState, seat: SeatId): boolean {
  if (state.knocker !== null || state.outcome) return false;
  // Veil: the runtime substitutes a claim's openings BEFORE legality runs, so
  // an honest-looking hand here proves nothing — offer the knock on counts
  // alone and let `validate` settle the claim against the opened cards.
  if (state.veiled) return true;
  return deadwoodOf(state.hands[seat] ?? []) <= state.rules.knockCap;
}

function discardable(state: GinState, seat: SeatId, card: CardId): boolean {
  if (!(state.hands[seat] ?? []).includes(card)) return false;
  // core rule: neither freshly drawn card may go straight back
  if (card === state.drawnFromStock) return false;
  if (card === state.drawnFromDiscard) return false;
  return true;
}

/** Pure deal shared by the def setup and the match layer's next-hand move. */
export function dealHand(
  ctx: {
    config: GinConfig;
    seats: number;
    rng: Rng;
    fx: FxEmitter;
    veiled?: boolean;
    deckOrder?: readonly CardId[];
  },
  dealer: SeatId,
): GinState {
  const order = ctx.deckOrder ?? shuffledIds(DECK, ctx.rng);
  const hands: CardId[][] = [];
  let cursor = 0;
  for (let seat = 0; seat < ctx.seats; seat++) {
    hands.push(order.slice(cursor, cursor + HAND_SIZE));
    cursor += HAND_SIZE;
  }

  let dealIndex = 0;
  for (let cardIndex = 0; cardIndex < HAND_SIZE; cardIndex++) {
    for (let seat = 0; seat < ctx.seats; seat++) {
      const card = hands[seat]?.[cardIndex];
      if (!card) continue;
      ctx.fx.emit(
        Fx.DealCard,
        { card, from: 'stock', to: `hand:${seat}`, dur: 170 },
        dealIndex * DEAL_STAGGER_MS,
      );
      dealIndex += 1;
    }
  }
  const flipped = order[cursor] as CardId;
  ctx.fx.emit(
    Fx.FlipCard,
    { card: flipped, from: 'stock', to: 'discard', dur: 180 },
    dealIndex * DEAL_STAGGER_MS,
  );

  return {
    rules: ctx.config,
    seats: ctx.seats,
    veiled: ctx.veiled === true,
    dealer,
    hands,
    stock: order.slice(cursor + 1),
    discard: [flipped],
    turn: dealer === 0 ? 1 : 0,
    optionSeat: dealer === 0 ? 1 : 0,
    passedUpcard: false,
    forceStockDraw: false,
    drawnFromStock: null,
    drawnFromDiscard: null,
    knocker: null,
    quietTurns: 0,
    pickups: [],
    outcome: null,
  };
}

// ---------------------------------------------------------------------------
// player moves
// ---------------------------------------------------------------------------

const optionTake: Move<GinState> = {
  validate(state, seat) {
    if (state.optionSeat !== seat) {
      return { code: 'not-your-option', message: 'it is not your call on the upcard' };
    }
    if (state.discard.length === 0) {
      return { code: 'empty-discard', message: 'there is no upcard to take' };
    }
    return true;
  },
  apply(state, _seat, _payload, ctx) {
    const card = state.discard[0] as CardId;
    const seat = state.optionSeat as SeatId;
    ctx.fx.emit(Fx.DrawCard, { card, seat, from: 'discard' });
    return {
      ...state,
      hands: state.hands.map((hand, at) => (at === seat ? addTo(hand, card) : hand)),
      discard: state.discard.slice(1),
      optionSeat: null,
      turn: seat,
      drawnFromDiscard: card,
      quietTurns: state.quietTurns + 1,
      pickups: [...state.pickups, { seat, card } satisfies Pickup],
    };
  },
};

const optionPass: Move<GinState> = {
  validate(state, seat) {
    if (state.optionSeat !== seat) {
      return { code: 'not-your-option', message: 'it is not your call on the upcard' };
    }
    return true;
  },
  apply(state, _seat) {
    if (!state.passedUpcard) {
      return { ...state, optionSeat: other(state.optionSeat as SeatId), passedUpcard: true };
    }
    // both seats passed — the non-dealer owes an automatic stock draw
    return {
      ...state,
      optionSeat: null,
      turn: nonDealer(state),
      forceStockDraw: true,
    };
  },
};

const drawStock: Move<GinState> = {
  validate(state) {
    if (state.stock.length === 0) {
      return { code: 'stock-exhausted', message: 'the stock is empty' };
    }
    return true;
  },
  apply(state, seat, _payload, ctx) {
    const card = state.stock[0] as CardId;
    ctx.fx.emit(Fx.DrawCard, { card, seat, from: 'stock' });
    return {
      ...state,
      hands: state.hands.map((hand, at) => (at === seat ? addTo(hand, card) : hand)),
      stock: state.stock.slice(1),
      turn: seat,
      drawnFromStock: card,
      forceStockDraw: false,
      quietTurns: 0,
    };
  },
};

const drawDiscard: Move<GinState> = {
  validate(state) {
    if (state.discard.length === 0) {
      return { code: 'empty-discard', message: 'the discard pile is empty' };
    }
    return true;
  },
  apply(state, seat, _payload, ctx) {
    const card = state.discard[0] as CardId;
    ctx.fx.emit(Fx.DrawCard, { card, seat, from: 'discard' });
    return {
      ...state,
      hands: state.hands.map((hand, at) => (at === seat ? addTo(hand, card) : hand)),
      discard: state.discard.slice(1),
      turn: seat,
      drawnFromDiscard: card,
      quietTurns: state.quietTurns + 1,
      pickups: [...state.pickups, { seat, card } satisfies Pickup],
    };
  },
};

const discardCard: Move<GinState> = {
  validate(state, seat, payload) {
    const card = (payload as { card?: unknown } | null)?.card;
    if (typeof card !== 'string') return { code: 'bad-payload', message: 'expected {card}' };
    if (!(state.hands[seat] ?? []).includes(card)) {
      return { code: 'not-in-hand', message: `${card} is not in seat ${seat}'s hand` };
    }
    if (card === state.drawnFromStock) {
      return {
        code: 'discard-locked',
        message: 'the card just drawn from the stock cannot be discarded',
      };
    }
    if (card === state.drawnFromDiscard) {
      return {
        code: 'discard-locked',
        message: 'the card just taken from the pile cannot be discarded',
      };
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const card = (payload as { card: CardId }).card;
    ctx.fx.emit(Fx.DiscardCard, { card, seat, to: 'discard' });
    return {
      ...state,
      hands: state.hands.map((hand, at) => (at === seat ? removeFrom(hand, card) : hand)),
      discard: addTo(state.discard, card),
      turn: other(seat),
      drawnFromStock: null,
      drawnFromDiscard: null,
    };
  },
};

const knock: Move<GinState> = {
  validate(state, seat) {
    if (state.knocker !== null) {
      return { code: 'already-knocked', message: 'someone has already knocked' };
    }
    const hand = state.hands[seat] ?? [];
    // under Veil the claim must open every card it is claiming about
    if (hasVeiledCard(hand)) {
      return { code: 'claim-not-opened', message: 'a knock must open the whole hand' };
    }
    const cap = state.rules.knockCap;
    if (deadwoodOf(hand) > cap) {
      return { code: 'deadwood-too-high', message: `deadwood is above the knock cap of ${cap}` };
    }
    return true;
  },
  apply(state, seat, _payload, ctx) {
    ctx.fx.emit(Fx.Knock, { seat });
    return { ...state, knocker: seat };
  },
};

// ---------------------------------------------------------------------------
// system moves (applied automatically by the flow)
// ---------------------------------------------------------------------------

const showdownOpen: Move<GinState> = {
  validate(state, seat) {
    const hand = state.hands[seat] ?? [];
    return hasVeiledCard(hand)
      ? { code: 'hand-not-opened', message: 'the whole hand must be opened' }
      : true;
  },
  apply(state, seat, _payload, ctx) {
    ctx.fx.emit('veil.open', { seat, cards: (state.hands[seat] ?? []).length });
    return state;
  },
};

const showdown: Move<GinState> = {
  validate(state) {
    if (state.knocker !== null) return true;
    return { code: 'no-knock', message: 'nobody knocked this hand' };
  },
  apply(state, _seat, _payload, ctx) {
    const scored = scoreHand(state);

    if (scored.reason === 'big-gin') {
      ctx.fx.emit('gin.big-gin', { seat: scored.knocker });
    } else if (scored.reason === 'gin') {
      ctx.fx.emit('gin.gin', { seat: scored.knocker });
    }

    const knockerSeat = scored.knocker as SeatId;
    const defender = other(knockerSeat);
    for (const layoff of scored.layoffs) {
      ctx.fx.emit('gin.layoff', {
        card: layoff.card,
        from: `hand:${defender}`,
        to: `seat:${knockerSeat}`,
      });
    }

    ctx.fx.emit(
      Fx.ShowdownReveal,
      {
        seat: knockerSeat,
        deadwood: scored.deadwood[0],
        melds: [...(state.hands[knockerSeat] ?? [])],
      },
      120,
    );
    ctx.fx.emit(
      Fx.ShowdownReveal,
      {
        seat: defender,
        deadwood: scored.deadwood[1],
        melds: [...(state.hands[defender] ?? [])],
      },
      320,
    );

    if (scored.reason === 'undercut') {
      ctx.fx.emit('gin.undercut', { seat: defender }, 520);
    }

    ctx.fx.emit(Fx.RoundEnd, { reason: scored.reason }, 700);
    return { ...state, outcome: scored };
  },
};

const handDead: Move<GinState> = {
  validate: () => true,
  apply(state, _seat, _payload, ctx) {
    ctx.fx.emit(Fx.RoundEnd, { reason: 'dead-hand' });
    const outcome = scoreHand({ ...state, knocker: null });
    return { ...state, outcome };
  },
};

// ---------------------------------------------------------------------------
// flow
// ---------------------------------------------------------------------------

type HandFlow = GameDef<GinState, GinConfig>['flow'];

const flow: HandFlow = {
  start: (state) => phaseFor(state),

  legalMoves(state, phase) {
    if (phase.actor === null || state.outcome) return [];
    switch (phase.phase) {
      case 'option': {
        return [{ id: 'option.take' }, { id: 'option.pass' }];
      }
      case 'turn': {
        const moves: LegalMove[] = [{ id: 'draw.stock' }];
        if (state.discard.length > 0 && !state.forceStockDraw) {
          moves.push({ id: 'draw.discard' });
        }
        return moves;
      }
      case 'act': {
        const seat = phase.actor as SeatId;
        const moves: LegalMove[] = (state.hands[seat] ?? [])
          .filter((card) => discardable(state, seat, card))
          .map((card) => ({ id: 'discard', payload: { card } }) satisfies LegalMove);
        if (knockLegality(state, seat)) moves.push({ id: 'knock' });
        return moves;
      }
      default:
        return [];
    }
  },

  legalMovesFor(state, phase, seat) {
    if (phase.phase === 'showdown.reveal') {
      return (phase.actors ?? []).includes(seat) ? [{ id: 'showdown.open' }] : [];
    }
    if (phase.actor !== seat) return [];
    return flow.legalMoves(state, phase);
  },

  advance(state, event) {
    if (state.outcome) {
      return { phase: { phase: 'over', actor: null, round: 1 } };
    }

    // a knock settles through layoffs and scoring once every hand can be read
    if (state.knocker !== null) {
      const closed = veiledSeats(state);
      if (closed.length > 0) {
        return {
          phase: revealPhase(closed),
        };
      }
      return {
        phase: phaseFor(state),
        autoMoves: [{ seat: null, move: 'showdown', reason: 'knock landed' }],
      };
    }

    if (event.move.startsWith('draw.') || event.move === 'option.take') {
      return { phase: actPhase(state) };
    }

    if (event.move === 'option.pass') {
      if (!state.forceStockDraw) return { phase: phaseFor(state) };
      return {
        phase: phaseFor(state),
        autoMoves: [{ seat: nonDealer(state), move: 'draw.stock', reason: 'both seats passed' }],
      };
    }

    if (event.move === 'discard') {
      // the turn completed — if the stock starved below three cards, the hand dies
      if (stockStarved(state)) {
        return {
          phase: phaseFor(state),
          autoMoves: [{ seat: null, move: 'hand.dead', reason: 'stock starved' }],
        };
      }
      return { phase: turnPhase(state) };
    }

    return { phase: phaseFor(state) };
  },
};

function stockStarved(state: GinState): boolean {
  return (
    (state.stock.length <= DEAD_STOCK_SIZE || state.quietTurns >= MAX_QUIET_TURNS) &&
    !state.forceStockDraw &&
    state.optionSeat === null &&
    state.knocker === null
  );
}

function veiledSeats(state: GinState): SeatId[] {
  if (!state.veiled) return [];
  return state.hands.flatMap((hand, seat) => (hasVeiledCard(hand) ? [seat as SeatId] : []));
}

function revealPhase(closed: readonly SeatId[]): PhaseState {
  return {
    phase: 'showdown.reveal',
    actor: closed[0] as SeatId,
    actors: closed,
    round: 1,
    label: 'showdown reveal',
  };
}

function phaseFor(state: GinState): PhaseState {
  if (state.outcome) return { phase: 'over', actor: null, round: 1 };
  if (state.optionSeat !== null) {
    return { phase: 'option', actor: state.optionSeat, round: 1, label: 'upcard option' };
  }
  return turnPhase(state);
}

function turnPhase(state: GinState): PhaseState {
  return { phase: 'turn', actor: state.turn, round: 1 };
}

function actPhase(state: GinState): PhaseState {
  return { phase: 'act', actor: state.turn, round: 1 };
}

// ---------------------------------------------------------------------------
// definition
// ---------------------------------------------------------------------------

export interface GinDefOptions {
  bots?: readonly BotPolicy<GinState>[];
}

/**
 * One complete gin rummy hand as a standalone headless game — deal → option →
 * draw/discard loop → knock/gin/dead. The shipped match def wraps this with
 * cumulative scoring and dealer rotation (see matchGame.ts).
 */
export function createGinHandDef(options: GinDefOptions = {}): GameDef<GinState, GinConfig> {
  return {
    id: 'gin-hand',
    howToPlay: ginHowToPlay,
    configSchema: ginConfigSchema,
    veil: ginVeil,

    setup(ctx) {
      return dealHand(ctx, 0);
    },

    moves: {
      'option.take': optionTake,
      'option.pass': optionPass,
      'draw.stock': drawStock,
      'draw.discard': drawDiscard,
      discard: discardCard,
      knock,
      'showdown.open': showdownOpen,
      showdown,
      'hand.dead': handDead,
    },

    flow,

    playerView(state, seat) {
      return {
        ...state,
        hands: state.hands.map(
          (hand, at) => (at === seat ? hand : hand.map(() => '?')), // placeholder keeps counts, hides faces
        ),
        stock: state.stock.map(() => '?'),
      };
    },

    end(state) {
      if (!state.outcome) return null;
      if (state.outcome.scorer === null) {
        return { winner: null, rankings: [], reason: state.outcome.reason };
      }
      const scorer = state.outcome.scorer;
      const loser = other(scorer);
      const rankings = [
        { seat: scorer, rank: 1, detail: { points: state.outcome.points } },
        { seat: loser, rank: 2, detail: {} as Record<string, number> },
      ];
      return {
        winner: scorer,
        rankings,
        reason: state.outcome.reason,
      };
    },

    bots: options.bots ?? [],
  };
}
