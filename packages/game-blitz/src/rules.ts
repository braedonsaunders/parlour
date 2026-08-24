import {
  addTo,
  Fx,
  removeFrom,
  shuffledIds,
  stdDeck,
  type BotPolicy,
  type CardId,
  type GameDef,
  type LegalMove,
  type Move,
  type MoveCtx,
  type SeatId,
} from '@parlour/engine';
import { blitzConfigSchema, type BlitzConfig } from './config';
import { isBlitz } from './hand';
import { TIER_BOTS } from './bots/personas';
import { matchResultOf, scoreRound } from './score';
import type { BlitzState, RoundOutcome } from './state';

const DECK = stdDeck();
export const HAND_SIZE = 3;
const DEAL_STAGGER_MS = 70;

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

function withDrawnFromDiscard(state: BlitzState, card: CardId | null): BlitzState {
  return { ...state, drawnFromDiscard: card };
}

/** lowest-numbered seat currently holding a suited 31, if any (spec §5.1) */
export function blitzSeat(state: BlitzState): SeatId | null {
  for (let seat = 0; seat < state.seats; seat++) {
    if (isBlitz(state.hands[seat] ?? [])) return seat;
  }
  return null;
}

function reshuffleStock(state: BlitzState, ctx: MoveCtx): BlitzState {
  const kept = state.discard.slice(1);
  const flipped = state.discard[0] as CardId;
  ctx.fx.emit(Fx.ShuffleStock, { cards: kept.length });
  return {
    ...state,
    stock: ctx.rng.shuffle(kept),
    discard: [flipped],
  };
}

// ---------------------------------------------------------------------------
// player moves
// ---------------------------------------------------------------------------

const drawStock: Move<BlitzState> = {
  validate(state) {
    if (state.stock.length === 0 && state.discard.length <= 1) {
      return { code: 'no-cards-to-draw', message: 'stock and discard are both exhausted' };
    }
    return true;
  },
  apply(state, seat, _payload, ctx) {
    let current = state;
    if (current.stock.length === 0) current = reshuffleStock(current, ctx);
    const card = current.stock[0] as CardId;
    ctx.fx.emit(Fx.DrawCard, { card, seat, from: 'stock' });
    const hands = current.hands.map((h, i) => (i === seat ? addTo(h, card) : h));
    return withDrawnFromDiscard(
      {
        ...current,
        hands,
        stock: current.stock.slice(1),
      },
      null,
    );
  },
};

const drawDiscard: Move<BlitzState> = {
  validate(state) {
    if (state.discard.length === 0) {
      return { code: 'empty-discard', message: 'the discard pile is empty' };
    }
    return true;
  },
  apply(state, seat, _payload, ctx) {
    const card = state.discard[0] as CardId;
    ctx.fx.emit(Fx.DrawCard, { card, seat, from: 'discard' });
    const hands = state.hands.map((h, i) => (i === seat ? addTo(h, card) : h));
    return {
      ...state,
      hands,
      discard: state.discard.slice(1),
      drawnFromDiscard: card,
      pickups: [...state.pickups, { seat, card }],
    };
  },
};

const discardCard: Move<BlitzState> = {
  validate(state, seat, payload) {
    const card = (payload as { card?: unknown } | null)?.card;
    if (typeof card !== 'string') return { code: 'bad-payload', message: 'expected {card}' };
    if (!(state.hands[seat] ?? []).includes(card)) {
      return { code: 'not-in-hand', message: `${card} is not in seat ${seat}'s hand` };
    }
    if (state.rules.discardLock && card === state.drawnFromDiscard) {
      return {
        code: 'discard-locked',
        message: 'the card just drawn from the discard pile must be kept',
      };
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const card = (payload as { card: CardId }).card;
    ctx.fx.emit(Fx.DiscardCard, { card, seat, to: 'discard' });
    let next: BlitzState = {
      ...state,
      hands: state.hands.map((h, i) => (i === seat ? removeFrom(h, card) : h)),
      discard: addTo(state.discard, card),
      drawnFromDiscard: null,
      turn: (seat + 1) % state.seats,
    };
    if (next.knocker !== null) {
      next = { ...next, postKnockTurns: next.postKnockTurns - 1 };
    }
    return next;
  },
};

const knock: Move<BlitzState> = {
  validate(state) {
    if (state.knocker !== null) {
      return { code: 'already-knocked', message: 'someone has already knocked this round' };
    }
    return true;
  },
  apply(state, seat, _payload, ctx) {
    ctx.fx.emit(Fx.Knock, { seat });
    return {
      ...state,
      knocker: seat,
      postKnockTurns: state.seats - 1,
      turn: (seat + 1) % state.seats,
    };
  },
};

// ---------------------------------------------------------------------------
// system moves (applied automatically by the flow)
// ---------------------------------------------------------------------------

const blitz: Move<BlitzState> = {
  validate: () => true,
  apply(state, _seat, payload, ctx) {
    const seat = (payload as { seat?: unknown } | null)?.seat;
    if (typeof seat !== 'number' || seat !== blitzSeat(state)) {
      throw new Error('blitz applied without a seat actually holding 31');
    }
    ctx.fx.emit(Fx.Blitz, { seat, handValue: 31 });
    const outcome: RoundOutcome = {
      reason: 'blitz',
      winners: [seat],
      rankings: [{ seat, rank: 1, detail: { handValue: 31 } }],
    };
    ctx.fx.emit(Fx.RoundEnd, { reason: outcome.reason });
    return { ...state, outcome };
  },
};

const showdown: Move<BlitzState> = {
  validate: () => true,
  apply(state, _seat, _payload, ctx) {
    const outcome = scoreRound(state);
    for (const rank of outcome.rankings) {
      ctx.fx.emit(Fx.ShowdownReveal, {
        seat: rank.seat,
        handValue: rank.detail?.handValue,
        rank: rank.rank,
      });
    }
    ctx.fx.emit(Fx.RoundEnd, { reason: outcome.reason });
    return { ...state, outcome };
  },
};

// ---------------------------------------------------------------------------
// flow
// ---------------------------------------------------------------------------

function turnPhase(state: BlitzState) {
  return { phase: 'turn', actor: state.turn, round: 1 };
}

const flow: GameDef<BlitzState, BlitzConfig>['flow'] = {
  start: (state) => turnPhase(state),

  legalMoves(state, phase) {
    if (phase.actor === null || state.outcome) return [];
    if (phase.phase === 'discard') {
      return (state.hands[phase.actor] ?? []).map(
        (card) =>
          ({
            id: 'discard',
            payload: { card },
          }) satisfies LegalMove,
      );
    }
    const moves: LegalMove[] = [{ id: 'draw.stock' }];
    if (state.discard.length > 0) moves.push({ id: 'draw.discard' });
    if (state.knocker === null) moves.push({ id: 'knock' });
    return moves;
  },

  advance(state, event, _seats) {
    if (state.outcome) {
      return { phase: { phase: 'over', actor: null, round: 1 } };
    }

    const blitting = blitzSeat(state);
    if (blitting !== null) {
      return {
        phase: turnPhase(state),
        autoMoves: [
          { seat: null, move: 'blitz', payload: { seat: blitting }, reason: 'hand hits 31' },
        ],
      };
    }

    if (state.knocker !== null && state.postKnockTurns === 0) {
      return {
        phase: turnPhase(state),
        autoMoves: [{ seat: null, move: 'showdown', reason: 'knock window closed' }],
      };
    }

    if (event.move.startsWith('draw.')) {
      return { phase: { phase: 'discard', actor: state.turn, round: 1 } };
    }
    return { phase: turnPhase(state) };
  },
};

// ---------------------------------------------------------------------------
// definition
// ---------------------------------------------------------------------------

export interface BlitzDefOptions {
  bots?: readonly BotPolicy<BlitzState>[];
}

/**
 * The headless Blitz round engine. A match format layer (lives / fast /
 * timed — spec §5.3) composes separate sessions of this def.
 */
export function createBlitzDef(options: BlitzDefOptions = {}): GameDef<BlitzState, BlitzConfig> {
  const bots = options.bots ?? TIER_BOTS;
  return {
    id: 'blitz',
    configSchema: blitzConfigSchema,
    setup({ config, seats, rng, fx }) {
      const ids = shuffledIds(DECK, rng);
      const hands: CardId[][] = [];
      let cursor = 0;
      for (let seat = 0; seat < seats; seat++) {
        const hand = ids.slice(cursor, cursor + HAND_SIZE);
        cursor += HAND_SIZE;
        hands.push(hand);
      }
      let dealIndex = 0;
      for (let cardIndex = 0; cardIndex < HAND_SIZE; cardIndex++) {
        for (let seat = 0; seat < seats; seat++) {
          const card = hands[seat]?.[cardIndex];
          if (!card) continue;
          fx.emit(
            Fx.DealCard,
            { card, from: 'stock', to: `hand:${seat}`, dur: 180 },
            dealIndex * DEAL_STAGGER_MS,
          );
          dealIndex += 1;
        }
      }
      const flipped = ids[cursor] as CardId;
      fx.emit(
        Fx.FlipCard,
        { card: flipped, from: 'stock', to: 'discard', dur: 180 },
        dealIndex * DEAL_STAGGER_MS,
      );

      const state: BlitzState = {
        rules: config,
        seats,
        hands,
        stock: ids.slice(cursor + 1),
        discard: [flipped],
        turn: 0,
        knocker: null,
        postKnockTurns: 0,
        drawnFromDiscard: null,
        pickups: [],
        outcome: null,
      };

      // a blitz dealt on the deal ends the round before any turn (spec §5.1)
      const dealt = blitzSeat(state);
      if (dealt !== null) fx.emit(Fx.Blitz, { seat: dealt, handValue: 31 });

      return state;
    },

    moves: {
      'draw.stock': drawStock,
      'draw.discard': drawDiscard,
      discard: discardCard,
      knock,
      blitz,
      showdown,
    },

    flow,

    playerView(state, seat) {
      return {
        ...state,
        hands: state.hands.map((h, i) => (i === seat ? h : h.map(() => '?'))),
        stock: state.stock.map(() => '?'),
      };
    },

    end(state) {
      if (state.outcome) return matchResultOf(state.outcome);
      const dealt = blitzSeat(state);
      if (dealt !== null) {
        return {
          winner: dealt,
          rankings: [{ seat: dealt, rank: 1, detail: { handValue: 31 } }],
          reason: 'blitz',
        };
      }
      return null;
    },

    bots,
  };
}
