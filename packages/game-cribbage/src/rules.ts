import {
  advanceSeat,
  dealOrder,
  Fx,
  hasVeiledCard,
  isVeilHandle,
  removeFrom,
  stdDeck,
  isVeiledDealPayload,
  VEILED_REDEAL_PENDING,
  veilSupport,
  seatOrder,
  type BotPolicy,
  type CardId,
  type FlowAdvance,
  type GameDef,
  type LegalMove,
  type Move,
  type MoveCtx,
  type PhaseState,
  type SeatId,
} from '@parlour/engine';
import { TIER_BOTS } from './bots';
import { cardValue } from './cards';
import { cribbageConfigSchema, type CribbageConfig } from './config';
import { cribbageHowToPlay } from './howto';
import { pegPlayScore, scoreShow, type ScoreEntry } from './score';
import {
  HAND_DEAL_SIZE,
  HAND_PEG_SIZE,
  SKUNK_LINE,
  TARGET_SCORE,
  type CribbageState,
  type GameOutcome,
  type PeggingState,
} from './state';

const DECK = stdDeck();
const DEAL_STAGGER_MS = 70;

export { HAND_DEAL_SIZE, SKUNK_LINE, TARGET_SCORE } from './state';

// ---------------------------------------------------------------------------
// small pure helpers
// ---------------------------------------------------------------------------

function allSeats(seats: number): SeatId[] {
  return seatOrder(0, seats);
}

function nextSeat(from: SeatId, seats: number): SeatId {
  return advanceSeat(from, seats);
}

function seatsWithCards(state: CribbageState): SeatId[] {
  return allSeats(state.seats).filter((seat) => (state.hands[seat] ?? []).length > 0);
}

/** Cards in `hand` that may legally be laid onto the running count. */
export function playableCards(pegging: PeggingState, hand: readonly CardId[]): CardId[] {
  return hand.filter((card) => pegging.count + cardValue(card) <= 31);
}

function emptyPegging(turn: SeatId | null = null): PeggingState {
  return { pile: [], owners: [], count: 0, turn, passed: [] };
}

function lastPlayerOf(owners: readonly SeatId[]): SeatId | null {
  return owners.length > 0 ? (owners[owners.length - 1] as SeatId) : null;
}

/**
 * Banks points onto the board. Every point in cribbage travels through here,
 * so the peg fx and the 121 check live in exactly one place. Emits the round
 * end (and the skunk call) the moment somebody lands on or past the target;
 * later awards in the same move are suppressed by the outcome guard.
 */
function awardPoints(
  state: CribbageState,
  seat: SeatId,
  points: number,
  ctx: MoveCtx,
  reason?: string,
): CribbageState {
  if (points <= 0 || state.outcome) return state;
  const from = state.totals[seat] ?? 0;
  const to = from + points;
  const totals = state.totals.map((total, index) => (index === seat ? to : total));
  ctx.fx.emit('cribbage.peg', { seat, from, to, reason });
  let next: CribbageState = { ...state, totals };

  if (to >= TARGET_SCORE && !next.outcome) {
    next = withOutcome(next, seat, ctx);
  }
  return next;
}

function withOutcome(state: CribbageState, winner: SeatId, ctx: MoveCtx): CribbageState {
  const losers = allSeats(state.seats).filter((seat) => seat !== winner);
  const worst = Math.min(...losers.map((seat) => state.totals[seat] ?? 0));
  const skunked = state.rules.skunks && worst < SKUNK_LINE;
  const ordered = allSeats(state.seats)
    .map((seat) => ({ seat, total: state.totals[seat] ?? 0 }))
    .sort((a, b) => b.total - a.total || a.seat - b.seat);
  const rankings = ordered.map(({ seat, total }, index) => ({
    seat,
    rank: index + 1,
    detail: { total },
  }));
  const outcome: GameOutcome = {
    winner,
    finalTotals: [...state.totals],
    skunked,
    reason: skunked ? 'skunk' : '121',
    rankings,
  };
  ctx.fx.emit(Fx.RoundEnd, { reason: outcome.reason });
  if (skunked) {
    const loser = losers.find((seat) => (state.totals[seat] ?? 0) === worst) ?? losers[0];
    if (loser !== undefined) ctx.fx.emit('cribbage.skunk', { winner, loser });
  }
  return { ...state, outcome };
}

// ---------------------------------------------------------------------------
// muggins bookkeeping
// ---------------------------------------------------------------------------

/**
 * With the house rule off, table points bank straight away. With it on, earned
 * points sit unclaimed until their earner claims them — any other seat may
 * steal them first. A scoring event by anyone banks a stale pot for its owner
 * before the new one is held, so at most one pot is ever outstanding.
 */
function bankOrHold(
  state: CribbageState,
  seat: SeatId,
  points: number,
  ctx: MoveCtx,
  reason: string,
): CribbageState {
  if (!state.rules.muggins) return awardPoints(state, seat, points, ctx, reason);
  let next = state;
  if (next.unclaimed && next.unclaimed.seat !== seat) {
    next = awardPoints(next, next.unclaimed.seat, next.unclaimed.points, ctx, 'claim');
  }
  const merged =
    next.unclaimed && next.unclaimed.seat === seat ? next.unclaimed.points + points : points;
  return { ...next, unclaimed: { seat, points: merged } };
}

/** Off-turn muggins decisions stay live: claim your own pot, steal theirs. */
function mugginsMovesFor(state: CribbageState, seat: SeatId): readonly LegalMove[] {
  if (!state.rules.muggins || state.pegging.turn === null || !state.unclaimed) return [];
  return [{ id: state.unclaimed.seat === seat ? 'claim' : 'steal', hint: 'muggins!' }];
}

// ---------------------------------------------------------------------------
// player moves
// ---------------------------------------------------------------------------

const cribDiscard: Move<CribbageState> = {
  validate(state, seat, payload) {
    if (state.starter !== null || state.pegging.turn !== null) {
      return { code: 'wrong-phase', message: 'the crib is closed' };
    }
    const cards = (payload as { cards?: unknown } | null)?.cards;
    if (
      !Array.isArray(cards) ||
      cards.length !== 2 ||
      typeof cards[0] !== 'string' ||
      typeof cards[1] !== 'string'
    ) {
      return { code: 'bad-payload', message: 'expected {cards: [card, card]}' };
    }
    const [a, b] = cards;
    if (a === b) return { code: 'duplicate-cards', message: 'two different cards are required' };
    const hand = state.hands[seat] ?? [];
    if (!hand.includes(a) || !hand.includes(b)) {
      return { code: 'not-in-hand', message: 'both crib cards must come from your hand' };
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const [a, b] = (payload as { cards: [CardId, CardId] }).cards;
    ctx.fx.emit('cribbage.crib.fly', { seat, cards: [a, b] });
    ctx.fx.emit('cribbage.crib.deal', { seat }); // audio-only slide cue
    return {
      ...state,
      hands: state.hands.map((held, index) =>
        index === seat ? held.filter((card) => card !== a && card !== b) : held,
      ),
      crib: [...state.crib, a, b],
    };
  },
};

/** The dealer cuts the starter. Under Veil the cut carries its own opening. */
const cut: Move<CribbageState> = {
  validate(state, seat) {
    if (state.starter !== null || state.pegging.turn !== null) {
      return { code: 'wrong-phase', message: 'there is nothing to cut' };
    }
    if (seat !== state.dealer) return { code: 'not-dealer', message: 'only the dealer cuts' };
    const top = state.stock[0];
    if (!top) return { code: 'empty-stock', message: 'the stock is exhausted' };
    // The runtime substitutes supplied openings before validate(), so a veiled
    // stock top that is STILL a handle means the mover opened nothing.
    if (isVeilHandle(top)) {
      return { code: 'cut-not-opened', message: 'the cut must reveal the starter' };
    }
    return true;
  },
  apply(state, _seat, _payload, ctx) {
    const starter = state.stock[0] as CardId;
    ctx.fx.emit(Fx.FlipCard, { card: starter, from: 'stock' });
    let next: CribbageState = {
      ...state,
      starter,
      stock: state.stock.slice(1),
      played: [],
      pegged: allSeats(state.seats).map(() => []),
      // the pone leads pegging
      pegging: emptyPegging(nextSeat(state.dealer, state.seats)),
    };
    if (starter.endsWith('11')) {
      ctx.fx.emit('cribbage.heels', { dealer: state.dealer });
      next = awardPoints(next, state.dealer, 2, ctx, 'heels');
    }
    if (!next.outcome) {
      ctx.fx.emit(Fx.TurnRing, { seat: nextSeat(state.dealer, state.seats) }, 140);
    }
    return next;
  },
};

const playCard: Move<CribbageState> = {
  validate(state, seat, payload) {
    if (state.pegging.turn === null || state.outcome) {
      return { code: 'wrong-phase', message: 'pegging is not underway' };
    }
    if (state.pegging.turn !== seat) return { code: 'not-your-turn', message: 'not your lead' };
    const card = (payload as { card?: unknown } | null)?.card;
    if (typeof card !== 'string') return { code: 'bad-payload', message: 'expected {card}' };
    if (!(state.hands[seat] ?? []).includes(card)) {
      return { code: 'not-in-hand', message: `${card} is not in your hand` };
    }
    if (isVeilHandle(card)) {
      return { code: 'play-not-opened', message: 'playing a card reveals it — attach the opening' };
    }
    if (state.pegging.count + cardValue(card) > 31) {
      return { code: 'count-exceeded', message: 'that card pushes the count past 31' };
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const card = (payload as { card: CardId }).card;
    const peg = pegPlayScore(state.pegging.pile, card);
    let next: CribbageState = {
      ...state,
      hands: state.hands.map((held, index) => (index === seat ? removeFrom(held, card) : held)),
      played: [...state.played, card],
      pegged: state.pegged.map((cards, index) => (index === seat ? [...cards, card] : cards)),
      pegging: {
        ...state.pegging,
        pile: [...state.pegging.pile, card],
        owners: [...state.pegging.owners, seat],
        count: state.pegging.count + cardValue(card),
      },
    };
    ctx.fx.emit(Fx.DiscardCard, { card, seat, to: 'peg' });

    if (peg.points > 0) {
      ctx.fx.emit('cribbage.score', {
        seat,
        points: peg.points,
        reasons: peg.reasons,
        reason:
          peg.reasons.find((reason) => reason === 'run') ??
          peg.reasons.find((reason) => reason === 'fifteen') ??
          peg.reasons.at(-1),
      });
      if (peg.reasons.includes('thirtyone')) ctx.fx.emit('cribbage.thirtyone', { seat });
      next = bankOrHold(next, seat, peg.points, ctx, peg.reasons.join('+'));
    }

    return settleAfterPlay(next, seat, ctx);
  },
};

/** Turn rotation and sequence settlement after a successful play. */
function settleAfterPlay(state: CribbageState, seat: SeatId, ctx: MoveCtx): CribbageState {
  const next = nextActor(state, seat);
  const dealtOut = seatsWithCards(state).length === 0;
  // nobody can act next (all spent or all passed), or the row filled to
  // exactly 31 — the sequence ends, with no go call paid on a 31 itself
  if (next === null || dealtOut || state.pegging.count === 31) {
    return finishSequence({ ...state, pegging: { ...state.pegging, turn: null } }, ctx);
  }
  return withTurnRing({ ...state, pegging: { ...state.pegging, turn: next } }, seat, ctx);
}

function withTurnRing(state: CribbageState, from: SeatId, ctx: MoveCtx): CribbageState {
  const turn = state.pegging.turn;
  if (turn !== null && turn !== from) ctx.fx.emit(Fx.TurnRing, { seat: turn }, 80);
  return state;
}

/** Seat after `from` that still owes action this sequence, or null if none. */
function nextActor(state: CribbageState, from: SeatId): SeatId | null {
  for (let step = 1; step <= state.seats; step++) {
    const seat = (from + step) % state.seats;
    if ((state.hands[seat] ?? []).length === 0) continue;
    if (state.pegging.passed.includes(seat)) continue;
    return seat;
  }
  return null;
}

/**
 * Nobody can play any more: the last card laid takes the go (unless the
 * sequence ended on exactly 31 — mutually exclusive), the count resets, and
 * the first holder after the last card leads the new sequence.
 */
function finishSequence(state: CribbageState, ctx?: MoveCtx): CribbageState {
  const last = lastPlayerOf(state.pegging.owners);
  let next = state;
  if (last !== null && next.pegging.count !== 31 && ctx) {
    next = bankOrHold(next, last, 1, ctx, 'go');
  }
  if (next.outcome) return { ...next, pegging: emptyPegging(null) };

  const holders = seatsWithCards(next);
  if (holders.length === 0) return { ...next, pegging: emptyPegging(null) };

  const seed = last !== null ? nextSeat(last, state.seats) : nextSeat(next.dealer, state.seats);
  for (let step = 0; step < state.seats; step++) {
    const candidate = (seed + step) % state.seats;
    if (holders.includes(candidate)) return { ...next, pegging: emptyPegging(candidate) };
  }
  return { ...next, pegging: emptyPegging(null) };
}

/** Announced automatically by the flow whenever the actor cannot legally lay. */
const go: Move<CribbageState> = {
  validate(state, seat) {
    if (state.pegging.turn !== seat) {
      return { code: 'not-your-turn', message: 'not your lead' };
    }
    if (playableCards(state.pegging, state.hands[seat] ?? []).length > 0) {
      return { code: 'can-still-play', message: 'you still have a legal card' };
    }
    return true;
  },
  apply(state, seat, _payload, ctx) {
    ctx.fx.emit('cribbage.go', { seat });
    const passed = [...new Set([...state.pegging.passed, seat])];
    const marked: CribbageState = { ...state, pegging: { ...state.pegging, passed } };
    const stuck = seatsWithCards(marked).every((holder) => passed.includes(holder));
    const next = stuck
      ? finishSequence(marked, ctx)
      : { ...marked, pegging: { ...marked.pegging, turn: nextActor(marked, seat) } };
    return withTurnRing(next, seat, ctx);
  },
};

const claim: Move<CribbageState> = {
  validate(state, seat) {
    if (!state.rules.muggins) {
      return { code: 'muggins-off', message: 'muggins is not on at this table' };
    }
    if (state.unclaimed?.seat !== seat) {
      return { code: 'nothing-to-claim', message: 'you have no unclaimed points' };
    }
    return true;
  },
  apply(state, seat, _payload, ctx) {
    const points = state.unclaimed?.points ?? 0;
    ctx.fx.emit('cribbage.muggins.claim', { seat, points });
    return awardPoints({ ...state, unclaimed: null }, seat, points, ctx, 'claim');
  },
};

const steal: Move<CribbageState> = {
  validate(state, seat) {
    if (!state.rules.muggins) {
      return { code: 'muggins-off', message: 'muggins is not on at this table' };
    }
    if (!state.unclaimed) {
      return { code: 'nothing-to-steal', message: 'no points are sitting unclaimed' };
    }
    if (state.unclaimed.seat === seat) {
      return { code: 'own-points', message: 'claim your own points instead' };
    }
    return true;
  },
  apply(state, seat, _payload, ctx) {
    const pot = state.unclaimed!;
    ctx.fx.emit('cribbage.muggins', { thief: seat, victim: pot.seat, points: pot.points });
    return awardPoints({ ...state, unclaimed: null }, seat, pot.points, ctx, 'muggins');
  },
};

// ---------------------------------------------------------------------------
// veil moves — opening private cards for the show
// ---------------------------------------------------------------------------

const showOpen: Move<CribbageState> = {
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

const cribOpen: Move<CribbageState> = {
  validate(state, seat) {
    if (seat !== state.dealer) {
      return { code: 'not-dealer', message: 'only the dealer opens the crib' };
    }
    return hasVeiledCard(state.crib)
      ? { code: 'crib-not-opened', message: 'the whole crib must be opened' }
      : true;
  },
  apply(state, seat, _payload, ctx) {
    ctx.fx.emit('veil.open', { seat, cards: state.crib.length, crib: true });
    return state;
  },
};

// ---------------------------------------------------------------------------
// system moves — the show and the next deal
// ---------------------------------------------------------------------------

interface ShowSegment {
  seat: SeatId;
  isCrib: boolean;
  label: string;
}

/**
 * Counts the show aloud, in order: pone, dealer, crib. Scoring stops dead the
 * instant somebody reaches 121 — a later hand simply never gets counted.
 */
const showScore: Move<CribbageState> = {
  validate: () => true,
  apply(state, _seat, _payload, ctx) {
    let next: CribbageState = { ...state, unclaimed: null };
    const pone = nextSeat(next.dealer, next.seats);
    const segments: ShowSegment[] = [
      { seat: pone, isCrib: false, label: 'hand' },
      { seat: next.dealer, isCrib: false, label: 'hand' },
      { seat: next.dealer, isCrib: true, label: 'crib' },
    ];
    for (const segment of segments) {
      if (next.outcome || next.starter === null) break;
      const hand = segment.isCrib ? next.crib : (next.pegged[segment.seat] ?? []);
      const scored = scoreShow(hand, next.starter, { isCrib: segment.isCrib });
      ctx.fx.emit(Fx.ShowdownReveal, {
        seat: segment.seat,
        label: segment.label,
        handValue: scored.total,
        entries: scored.entries.map(serializeEntry),
      });
      next = awardPoints(next, segment.seat, scored.total, ctx, 'show');
    }
    // defensive: a padded state can already sit past the target with no award
    // event to build the outcome — settle it here rather than hang the flow
    if (!next.outcome) {
      const leader = allSeats(next.seats).reduce(
        (best, seat) => ((next.totals[seat] ?? 0) > (next.totals[best] ?? 0) ? seat : best),
        0 as SeatId,
      );
      if ((next.totals[leader] ?? 0) >= TARGET_SCORE) {
        next = withOutcome(next, leader, ctx);
      }
    }
    return { ...next, showDone: true };
  },
};

function serializeEntry(entry: ScoreEntry): {
  reason: string;
  points: number;
  cards: readonly CardId[];
} {
  return { reason: entry.reason, points: entry.points, cards: entry.cards };
}

const dealNext: Move<CribbageState> = {
  validate(state, _seat, payload) {
    // Reshuffling the spent cards with the session rng deals an order every
    // seat can replay, which is fine in the open and ruinous under Veil. A
    // veiled deal waits for the deck the room's ceremony produced.
    if (state.veiled && !isVeiledDealPayload(payload)) {
      return { code: VEILED_REDEAL_PENDING, message: 'a veiled deal needs its own shuffled deck' };
    }
    return true;
  },
  apply(state, _seat, payload, ctx) {
    const spent = [
      ...state.hands.flat(),
      ...state.crib,
      ...state.played,
      ...(state.starter ? [state.starter] : []),
      ...state.stock,
    ];
    const shuffled = isVeiledDealPayload(payload) ? payload.deckOrder : ctx.rng.shuffle(spent);
    ctx.fx.emit(Fx.ShuffleStock, { cards: shuffled.length });

    const dealer = nextSeat(state.dealer, state.seats);
    let cursor = 0;
    const hands: CardId[][] = allSeats(state.seats).map(() => []);
    let dealIndex = 0;
    for (let round = 0; round < HAND_DEAL_SIZE; round++) {
      for (let seat = 0; seat < state.seats; seat++) {
        const card = shuffled[cursor++];
        if (!card) throw new Error('cribbage deck exhausted during redeal');
        hands[seat]?.push(card);
        ctx.fx.emit(
          Fx.DealCard,
          { card, from: 'stock', to: `hand:${seat}`, dur: 220 },
          dealIndex * DEAL_STAGGER_MS,
        );
        dealIndex += 1;
      }
    }
    return {
      ...state,
      dealer,
      dealNo: state.dealNo + 1,
      hands,
      crib: [],
      stock: shuffled.slice(cursor),
      starter: null,
      pegging: emptyPegging(),
      unclaimed: null,
      showDone: false,
    };
  },
};

// ---------------------------------------------------------------------------
// flow
// ---------------------------------------------------------------------------

function phaseFor(
  state: CribbageState,
  phase: string,
  actor: SeatId | null,
  actors?: readonly SeatId[],
  label?: string,
): PhaseState {
  return { phase, actor, actors, round: state.dealNo + 1, label: label ?? phase };
}

export function peggingComplete(state: CribbageState): boolean {
  return (
    state.starter !== null &&
    state.pegging.turn === null &&
    seatsWithCards(state).length === 0 &&
    !state.showDone
  );
}

function hasAnyVeil(state: CribbageState): boolean {
  return state.hands.some((hand) => hasVeiledCard(hand)) || hasVeiledCard(state.crib);
}

function revealPhase(state: CribbageState): PhaseState {
  const owing = allSeats(state.seats).filter((seat) => hasVeiledCard(state.hands[seat] ?? []));
  const actors =
    hasVeiledCard(state.crib) && !owing.includes(state.dealer) ? [...owing, state.dealer] : owing;
  return phaseFor(state, 'show.reveal', actors[0] ?? null, actors, 'show reveal');
}

const flow: GameDef<CribbageState, CribbageConfig>['flow'] = {
  start: (state) =>
    phaseFor(state, 'discard', state.dealer, allSeats(state.seats), 'crib discards'),

  /**
   * The one system event a cribbage game accepts: the next veiled deal.
   *
   * An open game deals itself, so nothing is injected. A veiled one waits for
   * a deck the room's ceremony produced. The move's own validation still runs,
   * so an injected event cannot deal where the rules would not.
   */
  canInject(state, _phase, moveId, payload) {
    if (moveId !== 'deal.next') {
      return { code: 'not-injectable', message: `cribbage does not accept injected ${moveId}` };
    }
    return dealNext.validate(state, state.dealer, payload);
  },

  legalMoves(state, phase) {
    if (phase.actor === null || state.outcome) return [];
    return legalForSeat(state, phase.actor);
  },

  legalMovesFor(state, phase, seat) {
    if (state.outcome) return [];
    const acting =
      phase.actors && phase.actors.length > 0 ? phase.actors.includes(seat) : phase.actor === seat;
    return acting ? legalForSeat(state, seat) : [];
  },

  advance(state, _event, _seats): FlowAdvance {
    if (state.outcome) {
      return {
        phase: phaseFor(state, 'over', null),
        ended: {
          winner: state.outcome.winner,
          rankings: [...state.outcome.rankings],
          reason: state.outcome.reason,
        },
      };
    }

    if (state.pegging.turn !== null) {
      const actor = state.pegging.turn;
      const hand = state.hands[actor] ?? [];
      if (playableCards(state.pegging, hand).length === 0) {
        return {
          phase: phaseFor(state, 'peg', actor, allSeats(state.seats)),
          autoMoves: [{ seat: actor, move: 'go', reason: 'no legal card below 31' }],
        };
      }
      return { phase: phaseFor(state, 'peg', actor, allSeats(state.seats)) };
    }

    if (state.starter === null) {
      // everyone at four cards means the cribs are thrown and the deck is cut
      if (state.hands.every((hand) => hand.length === HAND_PEG_SIZE)) {
        return { phase: phaseFor(state, 'cut', state.dealer, undefined, 'the cut') };
      }
      // point the primary actor at whoever still owes two to the crib
      const owing = state.hands.findIndex((hand) => hand.length === HAND_DEAL_SIZE);
      return {
        phase: phaseFor(
          state,
          'discard',
          owing >= 0 ? (owing as SeatId) : state.dealer,
          allSeats(state.seats),
          'crib discards',
        ),
      };
    }

    if (peggingComplete(state)) {
      if (hasAnyVeil(state)) return { phase: revealPhase(state) };
      return {
        phase: phaseFor(state, 'show', null, undefined, 'the show'),
        autoMoves: [{ seat: null, move: 'show.score', reason: 'hands are counted aloud' }],
      };
    }

    if (state.showDone) {
      // A veiled game waits here: its next deck comes out of a ceremony the
      // room runs, and it arrives as an injected `deal.next`.
      if (state.veiled) return { phase: phaseFor(state, 'between-deals', null) };
      return {
        phase: phaseFor(state, 'between-deals', null),
        autoMoves: [{ seat: null, move: 'deal.next', reason: 'dealer rotates' }],
      };
    }

    return { phase: phaseFor(state, 'idle', null) };
  },
};

function legalForSeat(state: CribbageState, seat: SeatId): readonly LegalMove[] {
  if (state.outcome) return [];

  // before the cut: simultaneous crib discards, then the dealer's cut
  if (state.starter === null) {
    const hand = state.hands[seat] ?? [];
    const allThrown = state.hands.every((held) => held.length === HAND_PEG_SIZE);
    if (!allThrown) {
      if (hand.length !== HAND_DEAL_SIZE) return []; // this seat already threw
      const moves: LegalMove[] = [];
      for (let a = 0; a < hand.length; a++) {
        for (let b = a + 1; b < hand.length; b++) {
          moves.push({ id: 'crib.discard', payload: { cards: [hand[a], hand[b]] } });
        }
      }
      return moves;
    }
    // everyone is down to four — the dealer may now cut
    if (seat === state.dealer && state.stock.length > 0) return [{ id: 'cut' }];
    return [];
  }

  if (state.pegging.turn !== null) {
    const own =
      state.pegging.turn === seat
        ? playableCards(state.pegging, state.hands[seat] ?? []).map(
            (card) => ({ id: 'playCard', payload: { card } }) satisfies LegalMove,
          )
        : [];
    return [...own, ...mugginsMovesFor(state, seat)];
  }

  if (peggingComplete(state)) {
    if (hasVeiledCard(state.hands[seat] ?? [])) return [{ id: 'show.open' }];
    if (hasVeiledCard(state.crib) && seat === state.dealer) return [{ id: 'crib.open' }];
    return [];
  }

  return [];
}

// ---------------------------------------------------------------------------
// definition
// ---------------------------------------------------------------------------

export interface CribbageDefOptions {
  bots?: readonly BotPolicy<CribbageState>[];
}

/**
 * The headless cribbage engine: one complete race to 121 with deals rotating
 * internally. Match play composes separate sessions of this def.
 */
export function createCribbageDef(
  options: CribbageDefOptions = {},
): GameDef<CribbageState, CribbageConfig> {
  const bots = options.bots ?? TIER_BOTS;
  return {
    id: 'cribbage',
    howToPlay: cribbageHowToPlay,
    configSchema: cribbageConfigSchema,
    // Veil, inherited: six cards a seat, nothing opened before the deal — the
    // crib stays dark until the show, and the cut opens its own starter.
    veil: veilSupport({
      deck: DECK,
      handSize: HAND_DEAL_SIZE,
      publicSetup: 'none',
      // A cribbage game is many deals in one session. Each veiled one needs
      // its own ceremony, so the room shuffles and hands the deck over.
      redealMove: 'deal.next',
    }),

    setup(ctx) {
      const { config, seats, fx } = ctx;
      const order = dealOrder(ctx, DECK);
      let cursor = 0;
      const hands: CardId[][] = allSeats(seats).map(() => []);
      let dealIndex = 0;
      for (let round = 0; round < HAND_DEAL_SIZE; round++) {
        for (let seat = 0; seat < seats; seat++) {
          const card = order[cursor++];
          if (!card) throw new Error('cribbage deck exhausted during deal');
          hands[seat]?.push(card);
          fx.emit(
            Fx.DealCard,
            { card, from: 'stock', to: `hand:${seat}`, dur: 220 },
            dealIndex * DEAL_STAGGER_MS,
          );
          dealIndex += 1;
        }
      }

      return {
        rules: config,
        seats,
        veiled: ctx.veiled === true,
        dealer: 0,
        dealNo: 0,
        hands,
        crib: [],
        stock: order.slice(cursor),
        played: [],
        pegged: allSeats(seats).map(() => []),
        starter: null,
        showDone: false,
        pegging: emptyPegging(),
        totals: allSeats(seats).map(() => 0),
        unclaimed: null,
        outcome: null,
      };
    },

    moves: {
      'crib.discard': cribDiscard,
      cut,
      playCard,
      go,
      claim,
      steal,
      'show.open': showOpen,
      'crib.open': cribOpen,
      'show.score': showScore,
      'deal.next': dealNext,
    },

    flow,

    playerView(state, seat) {
      return {
        ...state,
        hands: state.hands.map((held, index) => (index === seat ? held : held.map(() => '?'))),
        crib: state.showDone ? state.crib : state.crib.map(() => '?'),
        stock: state.stock.map(() => '?'),
      };
    },

    end(state) {
      if (!state.outcome) return null;
      return {
        winner: state.outcome.winner,
        rankings: [...state.outcome.rankings],
        reason: state.outcome.reason,
      };
    },

    bots,
  };
}
