import {
  Fx,
  dealOrder,
  type AutoMove,
  type CardId,
  type Flow,
  type FlowAdvance,
  type GameDef,
  type LegalMove,
  type Move,
  type PhaseState,
  type RuleError,
  type SeatId,
} from '@parlour/engine';
import { FIRST_RANK, LAST_RANK, dealtDeck, isWildCard, spiteFace } from './cards';
import { spiteConfig, type SpiteRules } from './config';
import { SPITE_BOTS } from './bots';
import { spiteHowToPlay } from './howto';
import { matchResult } from './score';
import { emptyCentre, type CentrePile, type SpiteState } from './state';

/** Longest window one opening deal may occupy (spec §7 cascade budget). */
const DEAL_SPAN_MAX_MS = 700;
/** Per-card gap on a short deal, before the span cap compresses it. */
const DEAL_STEP_MS = 70;

const FLIGHT_MS = 200;

/** Gap between cards in a multi-card draw or completion cascade. */
const CASCADE_STEP_MS = 75;
const CASCADE_SPAN_MAX_MS = 650;

function cascadeStep(count: number): number {
  return Math.min(CASCADE_STEP_MS, CASCADE_SPAN_MAX_MS / Math.max(1, count - 1));
}

// ---------------------------------------------------------------------------
// payload parsing — strict, because payloads arrive off the wire
// ---------------------------------------------------------------------------

function error(code: string, message: string): RuleError {
  return { code, message };
}

interface BuildPayload {
  card: CardId;
  pile: number;
  rank: number;
}

interface DiscardPayload {
  card: CardId;
  pile: number;
}

function parseBuild(payload: unknown): BuildPayload | null {
  const p = payload as { card?: unknown; pile?: unknown; rank?: unknown } | undefined;
  if (typeof p?.card !== 'string') return null;
  if (typeof p?.pile !== 'number' || !Number.isInteger(p.pile)) return null;
  if (typeof p?.rank !== 'number' || !Number.isInteger(p.rank)) return null;
  return { card: p.card, pile: p.pile, rank: p.rank };
}

function parseDiscard(payload: unknown): DiscardPayload | null {
  const p = payload as { card?: unknown; pile?: unknown } | undefined;
  if (typeof p?.card !== 'string') return null;
  if (typeof p?.pile !== 'number' || !Number.isInteger(p.pile)) return null;
  return { card: p.card, pile: p.pile };
}

// ---------------------------------------------------------------------------
// zone helpers
// ---------------------------------------------------------------------------

function hand(state: SpiteState, seat: SeatId): CardId[] {
  return state.hands[seat] ?? [];
}

function nextSeat(state: Pick<SpiteState, 'seats'>, seat: SeatId): SeatId {
  return (seat + 1) % state.seats;
}

/** Where a seat's copy of `card` sits, checked in the order a player would look. */
export type PlaySource = { kind: 'hand' } | { kind: 'payoff' } | { kind: 'discard'; pile: number };

export function locateCard(state: SpiteState, seat: SeatId, card: CardId): PlaySource | null {
  if (hand(state, seat).includes(card)) return { kind: 'hand' };
  if ((state.payoffs[seat] ?? [])[0] === card) return { kind: 'payoff' };
  const piles = state.discards[seat] ?? [];
  for (let pile = 0; pile < piles.length; pile++) {
    if (piles[pile]?.[0] === card) return { kind: 'discard', pile };
  }
  return null;
}

/** Can this card take the slot that wants `need`? A wild always can. */
export function fitsNeed(card: CardId, need: number): boolean {
  const face = spiteFace(card);
  if (face.meta.kind === 'veiled') return false;
  return isWildCard(card) || face.meta.value === need;
}

/**
 * What the pile will demand after `rank` lands on it. Past Queen the pile is
 * retired rather than asked for a thirteenth card, which callers handle before
 * consulting this.
 */
function nextDemand(rank: number): number {
  return rank + 1;
}

// ---------------------------------------------------------------------------
// moves
// ---------------------------------------------------------------------------

const build: Move<SpiteState> = {
  validate(state, seat, payload) {
    if (state.winner !== null) return error('match-over', 'the match has ended');
    if (state.turn !== seat) return error('not-your-turn', 'seat is not taking this turn');
    const parsed = parseBuild(payload);
    if (!parsed) return error('bad-payload', 'expected {card, pile, rank}');
    const { card, pile, rank } = parsed;
    if (pile < 0 || pile >= state.centre.length) {
      return error('bad-pile', `centre pile ${pile} does not exist`);
    }
    const target = state.centre[pile] as CentrePile;
    if (rank < FIRST_RANK || rank > LAST_RANK) {
      return error('bad-rank', `a wild must stand for ${FIRST_RANK} through ${LAST_RANK}`);
    }
    if (target.nextRank !== rank) {
      return error('wrong-rank', `that pile wants rank ${target.nextRank}, not ${rank}`);
    }
    if (locateCard(state, seat, card) === null) {
      return error(
        'not-available',
        `${card} is not in your hand, on your payoff pile, or atop your discards`,
      );
    }
    if (!isWildCard(card) && spiteFace(card).meta.value !== rank) {
      return error('wrong-rank', `${card} is a ${spiteFace(card).meta.value}, not a ${rank}`);
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const parsed = parseBuild(payload);
    if (!parsed) throw new Error('build apply requires {card, pile, rank}');
    const { card, pile, rank } = parsed;
    const source = locateCard(state, seat, card);
    if (!source) throw new Error(`build apply cannot locate ${card} for seat ${seat}`);

    // Take the card off wherever it came from.
    const hands = state.hands.map((cards, index) =>
      index === seat && source.kind === 'hand' ? cards.filter((held) => held !== card) : cards,
    );
    const payoffs = state.payoffs.map((pileCards, index) =>
      index === seat && source.kind === 'payoff' ? pileCards.slice(1) : pileCards,
    );
    const discards = state.discards.map((seatPiles, index) =>
      index === seat && source.kind === 'discard'
        ? seatPiles.map((pileCards, p) => (p === source.pile ? pileCards.slice(1) : pileCards))
        : seatPiles,
    );

    let centre = state.centre.map((existing, index) =>
      index === pile ? { cards: [card, ...existing.cards], nextRank: nextDemand(rank) } : existing,
    );
    const wildRanks =
      isWildCard(card) && state.wildRanks[card] !== rank
        ? { ...state.wildRanks, [card]: rank }
        : state.wildRanks;

    ctx.fx.emit(Fx.DealCard, {
      card,
      from:
        source.kind === 'hand'
          ? `hand:${seat}`
          : source.kind === 'payoff'
            ? `payoff:${seat}`
            : `discard:${seat}:${source.pile}`,
      to: `centre:${pile}`,
      dur: FLIGHT_MS,
    });
    if (isWildCard(card)) ctx.fx.emit('spite.wild', { seat, pile, card, rank });

    // Exposing the next payoff card is a small ceremony of its own.
    const flipped = payoffs[seat]?.[0];
    if (source.kind === 'payoff' && flipped !== undefined) {
      ctx.fx.emit(Fx.FlipCard, { card: flipped, seat }, FLIGHT_MS);
    }

    let stock = state.stock;
    let settledWildRanks = wildRanks;
    if (rank >= LAST_RANK) {
      // Queen lands: the whole pile retires to the stock. This is the moment
      // the game is played for, so every card flies home individually.
      const completed = (centre[pile] as CentrePile).cards;
      stock = ctx.rng.shuffle([...completed, ...stock]);
      centre = centre.map((existing, index) => (index === pile ? emptyCentre() : existing));
      // The pile's wilds no longer stand for anything — a card re-drawn later
      // must not inherit a claim from its previous life.
      const withoutRetired: Record<CardId, number> = {};
      for (const [id, recorded] of Object.entries(settledWildRanks)) {
        if (!completed.includes(id)) withoutRetired[id] = recorded;
      }
      settledWildRanks = withoutRetired;
      const step = cascadeStep(completed.length);
      completed.forEach((swept, index) => {
        ctx.fx.emit(
          Fx.DealCard,
          { card: swept, from: `centre:${pile}`, to: 'stock', dur: FLIGHT_MS },
          FLIGHT_MS + 60 + index * step,
        );
      });
      ctx.fx.emit(
        'spite.complete',
        { seat, pile, cards: completed, backTo: 'stock' },
        FLIGHT_MS + 60,
      );
      ctx.fx.emit(Fx.ShuffleStock, {}, FLIGHT_MS + 60 + completed.length * step);
    }

    const emptiedPayoff = source.kind === 'payoff' && (payoffs[seat] ?? []).length === 0;
    const winner = emptiedPayoff ? seat : state.winner;
    if (emptiedPayoff) {
      ctx.fx.emit('spite.win', { seat }, FLIGHT_MS);
      ctx.fx.emit(Fx.RoundEnd, { reason: 'payoff-cleared' }, FLIGHT_MS + 40);
    }

    return {
      ...state,
      hands,
      payoffs,
      discards,
      centre,
      wildRanks: settledWildRanks,
      stock,
      winner,
      stuckRuns: 0,
    };
  },
};

const discard: Move<SpiteState> = {
  validate(state, seat, payload) {
    if (state.winner !== null) return error('match-over', 'the match has ended');
    if (state.turn !== seat) return error('not-your-turn', 'seat is not taking this turn');
    const parsed = parseDiscard(payload);
    if (!parsed) return error('bad-payload', 'expected {card, pile}');
    const { card, pile } = parsed;
    if (pile < 0 || pile >= state.rules.discardPiles) {
      return error('bad-pile', `discard pile ${pile} does not exist`);
    }
    if (!hand(state, seat).includes(card)) {
      return error('not-in-hand', `${card} is not in the hand`);
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const parsed = parseDiscard(payload);
    if (!parsed) throw new Error('discard apply requires {card, pile}');
    const { card, pile } = parsed;
    ctx.fx.emit(Fx.DiscardCard, { card, seat, to: `discard:${seat}:${pile}` });
    // Discarding is the only way a turn ends — the handoff lives in the
    // reducer because advance() can observe state but never write it.
    return {
      ...state,
      hands: state.hands.map((cards, index) =>
        index === seat ? cards.filter((held) => held !== card) : cards,
      ),
      discards: state.discards.map((seatPiles, index) =>
        index === seat
          ? seatPiles.map((pileCards, p) => (p === pile ? [card, ...pileCards] : pileCards))
          : seatPiles,
      ),
      turn: nextSeat(state, seat),
      started: false,
      stuckRuns: 0,
    };
  },
};

/**
 * System move: the opening refill every turn starts with (and the mid-turn
 * refill when the table allows it). Never offered to a human — the flow fires
 * it automatically, which keeps "draw back up to five" un-skippable exactly as
 * the rules intend.
 */
/**
 * System move: the opening refill every turn starts with (and the mid-turn
 * refill when the table allows it). Never offered to a human — the flow fires
 * it automatically.
 *
 * Only the start-of-turn refill may gather a dry stock back from the centre
 * remnants. The mid-turn refill draws whatever is there and stops: letting it
 * sweep the centre into the actor's own hand lets one seat feed itself
 * forever, building instead of discarding, and the turn never rotates.
 */
const drawUp: Move<SpiteState> = {
  validate: () => true,
  apply(state, seat, payload, ctx) {
    const size = state.rules.handSize - hand(state, seat).length;
    if (size <= 0) return { ...state, started: true };
    const mayGather = (payload as { phase?: unknown } | null)?.phase === 'start';

    let stock = state.stock;
    let centre = state.centre;
    let wildRanks = state.wildRanks;

    // The stock recycles only through completed piles, and most of a deck can
    // end up buried in discard graves — a dry stock at the top of a turn
    // therefore takes the reshuffle rule's remedy: sweep every half-built
    // centre pile home, reset the demands to Ace, and put the buried cards
    // back in play. Loud, deliberate spite.
    const gather = (): void => {
      if (!mayGather || stock.length > 0 || !centre.some((pile) => pile.cards.length > 0)) {
        return;
      }
      const gatheredCards = centre.flatMap((pile) => pile.cards);
      stock = ctx.rng.shuffle(gatheredCards);
      centre = centre.map(() => emptyCentre());
      const stillStanding: Record<CardId, number> = {};
      for (const [id, recorded] of Object.entries(wildRanks)) {
        if (!gatheredCards.includes(id)) stillStanding[id] = recorded;
      }
      wildRanks = stillStanding;
      const gatherStep = cascadeStep(gatheredCards.length);
      gatheredCards.forEach((card, index) => {
        ctx.fx.emit(
          Fx.DealCard,
          { card, from: 'centre', to: 'stock', dur: FLIGHT_MS },
          index * gatherStep,
        );
      });
      ctx.fx.emit('spite.gather', { seat, cards: gatheredCards }, 0);
      ctx.fx.emit(Fx.ShuffleStock, {}, gatheredCards.length * gatherStep);
    };

    let drawn: CardId[] = [];
    let cursor = 0;
    while (drawn.length < size) {
      if (cursor >= stock.length) {
        gather();
        cursor = 0;
        if (stock.length === 0) break;
      }
      const take = Math.min(size - drawn.length, stock.length - cursor);
      drawn = [...drawn, ...stock.slice(cursor, cursor + take)];
      cursor += take;
    }

    const step = cascadeStep(drawn.length);
    drawn.forEach((card, index) => {
      ctx.fx.emit(Fx.DrawCard, { card, seat, from: 'stock' }, index * step);
    });
    return {
      ...state,
      stock: stock.slice(cursor),
      centre,
      wildRanks,
      hands: state.hands.map((cards, index) => (index === seat ? [...cards, ...drawn] : cards)),
      started: true,
    };
  },
};

/**
 * System move: a seat with genuinely nothing legal to do — dry stock, empty
 * hand, no playable top — sits out. Every seat sitting consecutively means the
 * table is deadlocked and `end` settles it instead of looping forever.
 */
const sit: Move<SpiteState> = {
  validate: () => true,
  apply(state, _seat, _payload, ctx) {
    ctx.fx.emit('spite.sit', { seat: state.turn });
    return {
      ...state,
      turn: nextSeat(state, state.turn),
      started: false,
      stuckRuns: state.stuckRuns + 1,
    };
  },
};

// ---------------------------------------------------------------------------
// legal-move enumeration
// ---------------------------------------------------------------------------

function legalBuilds(state: SpiteState, seat: SeatId): LegalMove[] {
  const moves: LegalMove[] = [];
  for (let pile = 0; pile < state.centre.length; pile++) {
    const demand = (state.centre[pile] as CentrePile).nextRank;
    // Payoff top first, then discard tops, then the hand: the enumeration
    // order IS a player's instinct. The payoff pile is the whole race, so the
    // moment its card fits, playing it is the move — and a naive "first legal
    // play" bot (or client) must never burn a hand card past its own win.
    const candidates: CardId[] = [];
    const payoffTop = (state.payoffs[seat] ?? [])[0];
    if (payoffTop !== undefined) candidates.push(payoffTop);
    for (const discardPile of state.discards[seat] ?? []) {
      const top = discardPile[0];
      if (top !== undefined) candidates.push(top);
    }
    candidates.push(...hand(state, seat));
    for (const card of candidates) {
      if (fitsNeed(card, demand)) {
        moves.push({ id: 'build', payload: { card, pile, rank: demand } });
      }
    }
  }
  return moves;
}

function legalDiscards(state: SpiteState, seat: SeatId): LegalMove[] {
  const moves: LegalMove[] = [];
  for (const card of hand(state, seat)) {
    for (let pile = 0; pile < state.rules.discardPiles; pile++) {
      moves.push({ id: 'discard', payload: { card, pile } });
    }
  }
  return moves;
}

function enumerateLegal(state: SpiteState, seat: SeatId): LegalMove[] {
  if (state.winner !== null) return [];
  return [...legalBuilds(state, seat), ...legalDiscards(state, seat)];
}

// ---------------------------------------------------------------------------
// flow
// ---------------------------------------------------------------------------

function phaseFor(state: SpiteState): PhaseState {
  if (state.winner !== null || state.stuckRuns >= state.seats) {
    return { phase: 'ended', actor: null, round: 1 };
  }
  return { phase: 'turn', actor: state.turn, round: 1, label: 'take your turn' };
}

/**
 * Turn shape: the `discard` move itself hands the turn on (reducers own state;
 * `advance` can only observe it), everything else keeps the actor acting.
 * Refills and stuck-sitting are automatic moves so a client cannot forget
 * them or abuse them.
 */
function advance(state: SpiteState): FlowAdvance {
  const done = matchResult(state);
  if (done) return { phase: phaseFor(state), ended: done };

  const phase = phaseFor(state);
  const autoMoves: AutoMove[] = [];
  if (!state.started) {
    autoMoves.push({
      seat: state.turn,
      move: 'drawUp',
      payload: { phase: 'start' },
      reason: 'start-of-turn refill',
    });
  } else if (
    state.rules.refillMidTurn &&
    hand(state, state.turn).length === 0 &&
    state.stock.length > 0
  ) {
    // Mid-turn refills never gather (that honour belongs to the start of a
    // turn), so a dry stock means the seat plays on short-handed instead.
    autoMoves.push({
      seat: state.turn,
      move: 'drawUp',
      payload: { phase: 'mid' },
      reason: 'hand emptied mid-turn',
    });
  } else if (enumerateLegal(state, state.turn).length === 0) {
    autoMoves.push({ seat: null, move: 'sit', reason: 'nothing left to play' });
  }
  return autoMoves.length > 0 ? { phase, autoMoves } : { phase };
}

const flow: Flow<SpiteState> = {
  start: (state) => phaseFor(state),
  legalMoves(state, phase) {
    if (phase.actor === null) return [];
    return enumerateLegal(state, phase.actor);
  },
  advance: (state) => advance(state),
};

// ---------------------------------------------------------------------------
// definition
// ---------------------------------------------------------------------------

export const spiteGame: GameDef<SpiteState, SpiteRules> = {
  id: 'spite',
  howToPlay: spiteHowToPlay,
  configSchema: spiteConfig,

  setup(ctx) {
    const { config, seats, fx } = ctx;
    if (!Number.isInteger(seats) || seats < 2 || seats > 4) {
      throw new Error('spite requires 2–4 seats');
    }
    const deck = dealtDeck(config.wilds);
    const ids = dealOrder(ctx, deck);
    const minimum = seats * (config.payoffSize + config.handSize);
    if (ids.length < minimum) {
      throw new Error(`spite deck of ${ids.length} cannot cover a ${seats}-seat deal`);
    }

    const payoffs: CardId[][] = [];
    const hands: CardId[][] = [];
    let cursor = 0;
    for (let seat = 0; seat < seats; seat++) {
      const pile = ids.slice(cursor, cursor + config.payoffSize).reverse();
      cursor += config.payoffSize;
      payoffs.push(pile);
      hands.push(ids.slice(cursor, cursor + config.handSize));
      cursor += config.handSize;
    }
    const stock = ids.slice(cursor);

    // Face-down payoff flights, then hands, then the tops turn over — the same
    // rhythm as dealing at a real table. Long deals compress into the budget.
    const dealt = seats * (config.payoffSize + config.handSize);
    const step = Math.min(DEAL_STEP_MS, Math.floor(DEAL_SPAN_MAX_MS / Math.max(1, dealt)));
    let index = 0;
    for (let round = 0; round < config.payoffSize; round++) {
      for (let seat = 0; seat < seats; seat++) {
        const card = payoffs[seat]?.[config.payoffSize - 1 - round];
        if (card) {
          fx.emit(
            Fx.DealCard,
            { card, from: 'stock', to: `payoff:${seat}`, dur: 220 },
            index * step,
          );
          index += 1;
        }
      }
    }
    for (let round = 0; round < config.handSize; round++) {
      for (let seat = 0; seat < seats; seat++) {
        const card = hands[seat]?.[round];
        if (card) {
          fx.emit(Fx.DealCard, { card, from: 'stock', to: `hand:${seat}`, dur: 220 }, index * step);
          index += 1;
        }
      }
    }
    for (let seat = 0; seat < seats; seat++) {
      const top = payoffs[seat]?.[0];
      if (top) fx.emit(Fx.FlipCard, { card: top, seat }, index * step + 120);
    }

    return {
      rules: config,
      seats,
      hands,
      payoffs,
      discards: Array.from({ length: seats }, () =>
        Array.from({ length: config.discardPiles }, () => [] as CardId[]),
      ),
      stock,
      centre: Array.from({ length: config.buildPiles }, () => emptyCentre()),
      wildRanks: {},
      turn: 0,
      started: true,
      stuckRuns: 0,
      winner: null,
    };
  },

  moves: { build, discard, drawUp, sit },

  flow,

  playerView(state, seat) {
    return {
      ...state,
      hands: state.hands.map((cards, index) =>
        index === seat ? cards.slice() : cards.map(() => '??'),
      ),
      payoffs: state.payoffs.map((pile) => pile.map((card, index) => (index === 0 ? card : '??'))),
      stock: state.stock.map(() => '??'),
    };
  },

  end: matchResult,

  bots: SPITE_BOTS,
};
