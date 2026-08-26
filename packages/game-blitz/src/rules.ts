import {
  advanceSeat,
  addTo,
  dealOrder,
  Fx,
  hasVeiledCard,
  isVeilHandle,
  removeFrom,
  stdDeck,
  veilSupport,
  type BotPolicy,
  type CardId,
  type GameDef,
  type LegalMove,
  type Move,
  type MoveCtx,
  type PhaseState,
  type SeatId,
} from '@parlour/engine';
import { blitzHowToPlay } from './howto';
import { blitzConfigSchema, outSeatsFromMask, type BlitzConfig } from './config';
import { isBlitz } from './hand';
import { TIER_BOTS } from './bots/personas';
import { matchResultOf, scoreRound } from './score';
import { isSittingOut, liveSeats, type BlitzState, type RoundOutcome } from './state';

const DECK = stdDeck();
export const HAND_SIZE = 3;
const DEAL_STAGGER_MS = 70;

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

function withDrawnFromDiscard(state: BlitzState, card: CardId | null): BlitzState {
  return { ...state, drawnFromDiscard: card };
}

/**
 * Lowest-numbered seat currently holding a suited 31, if any (spec §5.1).
 *
 * A veiled hand is unreadable — the table literally cannot see 31 in it — so it
 * is skipped here and its owner claims with `blitz.claim` instead.
 */
export function blitzSeat(state: BlitzState): SeatId | null {
  for (const seat of liveSeats(state)) {
    const hand = state.hands[seat] ?? [];
    if (hasVeiledCard(hand)) continue;
    if (isBlitz(hand)) return seat;
  }
  return null;
}

/** Seats whose hand is still face down to the table. */
function veiledSeats(state: BlitzState): SeatId[] {
  const seats: SeatId[] = [];
  for (let seat = 0; seat < state.seats; seat++) {
    if (hasVeiledCard(state.hands[seat] ?? [])) seats.push(seat);
  }
  return seats;
}

function isRealCard(card: CardId): boolean {
  return !isVeilHandle(card);
}

function nextLiveSeat(state: BlitzState, from: SeatId): SeatId {
  const live = liveSeats(state);
  for (let step = 1; step <= state.seats; step++) {
    const seat = advanceSeat(from, state.seats, step);
    if (live.includes(seat)) return seat;
  }
  return live[0] ?? from;
}

function requireLive(state: BlitzState, seat: SeatId): true | { code: string; message: string } {
  if (isSittingOut(state, seat)) {
    return { code: 'seat-out', message: `seat ${seat} is out of the match` };
  }
  return true;
}

/** House-rule lock: the card just taken from discard cannot go straight back. */
function discardable(state: BlitzState, seat: SeatId, card: CardId): boolean {
  if (!(state.hands[seat] ?? []).includes(card)) return false;
  if (state.rules.discardLock && card === state.drawnFromDiscard) return false;
  return true;
}

function reshuffleStock(state: BlitzState, ctx: MoveCtx): BlitzState {
  const kept = state.discard.slice(1);
  const flipped = state.discard[0] as CardId;
  ctx.fx.emit(Fx.ShuffleStock, { cards: kept.length });
  return {
    ...state,
    stock: ctx.recycle ? [...ctx.recycle.issue] : ctx.rng.shuffle(kept),
    discard: [flipped],
  };
}

// ---------------------------------------------------------------------------
// player moves
// ---------------------------------------------------------------------------

const drawStock: Move<BlitzState> = {
  validate(state, seat, _payload, ctx) {
    const live = requireLive(state, seat);
    if (live !== true) return live;
    if (state.stock.length === 0 && state.discard.length <= 1) {
      return { code: 'no-cards-to-draw', message: 'stock and discard are both exhausted' };
    }
    // Recycling a spent discard is the one moment a veiled round could quietly
    // go public: the pile is face up, so shuffling it as-is would make every
    // remaining draw readable. The room has to re-veil it first.
    if (
      state.veiled &&
      state.stock.length === 0 &&
      state.discard.slice(1).some(isRealCard) &&
      !ctx?.recycle
    ) {
      return {
        code: 'stock-not-reveiled',
        message: 'the discard pile must be re-veiled before it becomes the stock',
      };
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
  validate(state, seat) {
    const live = requireLive(state, seat);
    if (live !== true) return live;
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
    const live = requireLive(state, seat);
    if (live !== true) return live;
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
      turn: nextLiveSeat(state, seat),
    };
    if (next.knocker !== null) {
      next = { ...next, postKnockTurns: next.postKnockTurns - 1 };
    }
    return next;
  },
};

const knock: Move<BlitzState> = {
  validate(state, seat) {
    const live = requireLive(state, seat);
    if (live !== true) return live;
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
      postKnockTurns: Math.max(0, liveSeats(state).length - 1),
      turn: nextLiveSeat(state, seat),
    };
  },
};

// ---------------------------------------------------------------------------
// veil moves — the honest cost of hiding hands (apps/web/src/lib/multiplayer/veil)
// ---------------------------------------------------------------------------

/**
 * Claim a 31 under Veil.
 *
 * In an open room the flow spots a blitz the instant it exists, because it can
 * read every hand. Under Veil only the owner can, so the claim carries the
 * openings for the claimant's whole hand and the table checks the arithmetic
 * itself. A false claim is rejected without ever entering the log, so the
 * bluff costs the claimant nothing but also gains them nothing — and a true
 * claim is settled by the same `blitz` move an open room uses.
 */
const claimBlitz: Move<BlitzState> = {
  validate(state, seat) {
    const live = requireLive(state, seat);
    if (live !== true) return live;
    if (state.outcome) return { code: 'round-over', message: 'the round is already decided' };
    const hand = state.hands[seat] ?? [];
    if (hasVeiledCard(hand)) {
      return { code: 'claim-not-opened', message: 'a blitz claim must open the whole hand' };
    }
    if (hand.length !== HAND_SIZE) {
      return { code: 'claim-mid-turn', message: 'finish the turn before claiming a blitz' };
    }
    if (!isBlitz(hand)) {
      return { code: 'not-a-blitz', message: `seat ${seat} is not holding 31` };
    }
    return true;
  },
  // The openings already landed; `flow.advance` now sees the 31 and runs the
  // ordinary `blitz` settlement, so claimed and unclaimed blitzes score alike.
  apply: (state) => state,
};

/**
 * Open a hand for the showdown. Under Veil the knock window closing is not
 * enough to score the round — the hands have to come face up first, and each
 * seat opens its own.
 */
const openForShowdown: Move<BlitzState> = {
  validate(state, seat) {
    if (state.outcome) return { code: 'round-over', message: 'the round is already decided' };
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

/**
 * Under Veil every seat stays an acting seat so it can claim a blitz the table
 * cannot see. `legalMovesFor` still keeps the turn itself to one seat, so this
 * widens who may *speak up*, never who may play.
 */
function withClaimants(state: BlitzState, phase: PhaseState): PhaseState {
  return state.veiled ? { ...phase, actors: liveSeats(state) } : phase;
}

function turnPhase(state: BlitzState): PhaseState {
  return withClaimants(state, { phase: 'turn', actor: state.turn, round: 1 });
}

function discardPhase(state: BlitzState): PhaseState {
  return withClaimants(state, { phase: 'discard', actor: state.turn, round: 1 });
}

/**
 * A seat may claim once its hand is back to three cards. Legality is deliberately
 * public — it depends only on the card *count*, which the whole table can see.
 * Whether the hand is actually 31 is settled by `claimBlitz.validate` against
 * the openings the claim carried, so legality never leaks the hand.
 */
function canClaimBlitz(state: BlitzState, seat: SeatId): boolean {
  if (!state.veiled || state.outcome || isSittingOut(state, seat)) return false;
  return (state.hands[seat] ?? []).length === HAND_SIZE;
}

const flow: GameDef<BlitzState, BlitzConfig>['flow'] = {
  start: (state) => turnPhase(state),

  legalMoves(state, phase) {
    if (phase.actor === null || state.outcome || isSittingOut(state, phase.actor)) return [];
    if (phase.phase === 'showdown.reveal') return [];
    if (phase.phase === 'discard') {
      return (state.hands[phase.actor] ?? [])
        .filter((card) => discardable(state, phase.actor as SeatId, card))
        .map(
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

  legalMovesFor(state, phase, seat) {
    if (state.outcome || isSittingOut(state, seat)) return [];
    if (phase.phase === 'showdown.reveal') {
      // The phase itself lists the seats still owing a reveal, so this stays
      // true even after the move's own openings have landed.
      return (phase.actors ?? []).includes(seat) ? [{ id: 'showdown.open' }] : [];
    }
    const claim: LegalMove[] = canClaimBlitz(state, seat)
      ? [{ id: 'blitz.claim', hint: 'you are holding 31' }]
      : [];
    if (phase.actor !== seat) return claim;
    return [...flow.legalMoves(state, phase), ...claim];
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
      // Veiled hands cannot be scored, so the knock window closing opens a
      // reveal phase instead of scoring straight away.
      const closed = veiledSeats(state);
      if (closed.length > 0) {
        return {
          phase: {
            phase: 'showdown.reveal',
            actor: closed[0] as SeatId,
            actors: closed,
            round: 1,
            label: 'showdown reveal',
          },
        };
      }
      return {
        phase: turnPhase(state),
        autoMoves: [{ seat: null, move: 'showdown', reason: 'knock window closed' }],
      };
    }

    if (event.move.startsWith('draw.')) {
      return { phase: discardPhase(state) };
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
    howToPlay: blitzHowToPlay,
    configSchema: blitzConfigSchema,
    // Veil, inherited: three cards a seat, then one card the room turns face up
    // in public to start the discard.
    veil: veilSupport({ deck: DECK, handSize: HAND_SIZE, publicSetup: 'one' }),

    setup(ctx) {
      const { config, seats, fx } = ctx;
      const out = outSeatsFromMask(config.outMask, seats);
      const ids = dealOrder(ctx, DECK);
      const hands: CardId[][] = [];
      let cursor = 0;
      for (let seat = 0; seat < seats; seat++) {
        if (out.includes(seat)) {
          hands.push([]);
          continue;
        }
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
            { card, from: 'stock', to: `hand:${seat}`, dur: 220 },
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

      const turn = out.includes(0)
        ? (Array.from({ length: seats }, (_, seat) => seat).find((seat) => !out.includes(seat)) ??
          0)
        : 0;
      const state: BlitzState = {
        rules: config,
        seats,
        hands,
        stock: ids.slice(cursor + 1),
        discard: [flipped],
        turn,
        knocker: null,
        postKnockTurns: 0,
        drawnFromDiscard: null,
        pickups: [],
        outcome: null,
        out,
        veiled: ctx.veiled === true,
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
      'blitz.claim': claimBlitz,
      'showdown.open': openForShowdown,
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
