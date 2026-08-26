import {
  advanceSeat,
  Fx,
  VEILED_REDEAL_PENDING,
  isVeiledDealPayload,
  type BotPolicy,
  type CardId,
  type FlowAdvance,
  type FxEmitter,
  type GameDef,
  type LegalMove,
  type Move,
  type PhaseState,
  type RuleError,
  type Rng,
  type SeatId,
  type VeilSupport,
} from '@parlour/engine';
import { TIER_BOTS } from './bots';
import { captureOptions, singleMatches } from './capture';
import {
  countKings,
  captureValue,
  dealLayout,
  DEAL_PER_TURN,
  DECK,
  GAME_SEATS,
  ownerCount,
} from './cards';
import { scopaConfig, type ScopaRules } from './config';
import { scopaHowToPlay } from './howto';
import { matchOver, matchResultFor, scoreRound } from './score';
import type { RoundSummary, ScopaState } from './state';

export const GAME_ID = 'scopa';

export const ScopaFx = {
  Pose: 'scopa.pose',
  Capture: 'scopa.capture',
  Scopa: 'scopa.scopa',
  Sweep: 'scopa.sweep',
  Award: 'scopa.award',
  RoundScore: 'scopa.round-score',
} as const;

/**
 * Veil support for Scopa.
 *
 * Scopa's deal layout takes the first four cards of the deck as the public
 * tableau and deals the rest as private hands + stock. So the public setup
 * cards sit at deck positions [0…3], NOT after the hands — the conventional
 * {@link veilSupport} helper expects them at the end, which is wrong here.
 *
 * Constructed directly instead: publicSetupFrom returns 0, and the room
 * opens four positions before dealing. Each subsequent round needs its own
 * ceremony ({@link redealMove} says which move that is), because a round
 * ends with a fresh shuffle that must be unpredictable to every seat.
 *
 * The hands carry the private handle list the room's default accessor
 * already understands — `hands[seat]` at the state root — so no
 * `privateHandles` override is needed.
 */
const scopaVeil: VeilSupport = {
  deck: () => DECK,
  publicSetupFrom: () => 0,
  publicSetupReady: (opened) => opened.length >= 4,
  redealMove: 'nextRound',
};

const REDEAL_LIMIT = 1000;
const TURN_RING_DELAY_MS = 140;
const AWARD_STAGGER_MS = 90;

function err(code: string, message: string): RuleError {
  return { code, message };
}

interface PlayPayload {
  card: CardId | null;
  /** null means malformed; [] means an intentional pose */
  take: CardId[] | null;
}

function parsePlay(payload: unknown): PlayPayload {
  const raw = payload as { card?: unknown; take?: unknown } | undefined;
  const card = typeof raw?.card === 'string' && raw.card.length > 0 ? raw.card : null;
  if (raw?.take === undefined) return { card, take: [] };
  if (!Array.isArray(raw.take)) return { card, take: null };
  const take = raw.take.filter((id): id is CardId => typeof id === 'string');
  return take.length === raw.take.length ? { card, take } : { card, take: null };
}

function handOf(state: ScopaState, seat: SeatId): CardId[] {
  return state.hands[seat] ?? [];
}

function handsAllEmpty(state: ScopaState): boolean {
  return state.hands.every((hand) => hand.length === 0);
}

function isFinalPlay(state: ScopaState, nextHands: readonly CardId[][]): boolean {
  return nextHands.every((hand) => hand.length === 0) && state.stock.length === 0;
}

/**
 * The capture rules in one gate: a singleton match forces a capture (so a
 * pose or combination is refused), and any take must be distinct cards off
 * the table summing exactly to the played card's value.
 */
function captureFault(
  state: ScopaState,
  seat: SeatId,
  card: CardId,
  take: readonly CardId[],
): RuleError | null {
  if (!handOf(state, seat).includes(card)) {
    return err('not-in-hand', `${card} is not in the hand`);
  }
  const value = captureValue(card);
  if (take.length === 0) {
    if (singleMatches(value, state.table).length > 0) {
      return err('capture-forced', 'a single-card capture is available');
    }
    return null;
  }
  if (new Set(take).size !== take.length) {
    return err('bad-capture', 'a take may not name the same table card twice');
  }
  for (const id of take) {
    if (!state.table.includes(id)) return err('bad-capture', `${id} is not on the table`);
  }
  const sum = take.reduce((total, id) => total + captureValue(id), 0);
  if (sum !== value) {
    return err('bad-capture', 'taken cards must sum to the played card');
  }
  if (take.length >= 2 && singleMatches(value, state.table).length > 0) {
    return err('capture-forced', 'a single-card capture is available');
  }
  return null;
}

const playCard: Move<ScopaState> = {
  validate(state, seat, payload): true | RuleError {
    if (state.stage !== 'playing') return err('not-playing', 'the round is not in play');
    if (state.turn !== seat) return err('not-your-turn', 'another seat plays this card');
    const parsed = parsePlay(payload);
    if (!parsed.card) return err('bad-play', 'expected {card}');
    if (parsed.take === null) return err('bad-play', 'expected {take} to be a list of card ids');
    const fault = captureFault(state, seat, parsed.card, parsed.take);
    return fault ?? true;
  },

  apply(state, seat, payload, ctx) {
    const { card, take } = parsePlay(payload) as { card: CardId; take: CardId[] };
    const nextHands = state.hands.map((held, index) =>
      index === seat ? held.filter((held1) => held1 !== card) : held.slice(),
    );
    let table = state.table.filter((id) => !take.includes(id));
    const captures = state.captures.map((pile, index) => (index === seat ? pile : pile.slice()));
    const scope = state.scope.slice();
    let lastCapturer = state.lastCapturer;
    const finalPlay = isFinalPlay(state, nextHands);

    if (take.length > 0) {
      captures[seat]!.push(card, ...take);
      lastCapturer = seat;
      // one collect event carrying every moved card — the UI animates the sweep
      ctx.fx.emit(ScopaFx.Capture, { seat, card, take: [...take], count: take.length + 1 });
    } else {
      table = [...table, card];
      ctx.fx.emit(ScopaFx.Pose, { seat, card });
    }

    // A scopa clears the table mid-round. The very last card of the final deal
    // never scores one — those cards would be swept anyway.
    if (!finalPlay && table.length === 0) {
      scope[seat] = (scope[seat] ?? 0) + 1;
      ctx.fx.emit(ScopaFx.Scopa, { seat, round: state.roundNo }, 60);
    }

    // End of the round: the last capturer sweeps whatever is left — no scopa.
    if (finalPlay && table.length > 0 && lastCapturer !== null) {
      captures[lastCapturer]!.push(...table);
      ctx.fx.emit(ScopaFx.Sweep, { seat: lastCapturer, cards: [...table], count: table.length });
      table = [];
    }

    const turn = advanceSeat(seat, state.seats);
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, TURN_RING_DELAY_MS);

    return {
      ...state,
      hands: nextHands,
      table,
      captures,
      scope,
      lastCapturer,
      turn,
      stage: 'playing',
    };
  },
};

/** Deals three fresh cards to every seat whenever all hands empty out. */
const deal: Move<ScopaState> = {
  validate(state) {
    if (state.stage !== 'playing') return err('not-playing', 'the round is not in play');
    if (state.stock.length === 0) return err('stock-empty', 'there is nothing left to deal');
    if (!handsAllEmpty(state)) return err('hands-not-empty', 'hands still hold cards');
    return true;
  },

  apply(state, _seat, _payload, ctx) {
    const stock = state.stock.slice();
    const hands = state.hands.map((held) => held.slice());
    const flights = DEAL_PER_TURN * state.seats;
    // keep the whole cascade under ~700 ms even at six seats
    const stagger = Math.min(65, Math.floor(650 / Math.max(1, flights - 1)));
    let at = 0;
    for (let round = 0; round < DEAL_PER_TURN; round++) {
      for (let seat = 0; seat < state.seats; seat++) {
        const card = stock.shift() as CardId;
        hands[seat]!.push(card);
        ctx.fx.emit(Fx.DealCard, { card: '??', from: 'stock', to: `hand:${seat}`, dur: 200 }, at);
        at += stagger;
      }
    }
    return { ...state, hands, stock };
  },
};

function seatHolding(state: ScopaState, card: CardId): SeatId | null {
  for (let seat = 0; seat < state.captures.length; seat++) {
    if ((state.captures[seat] ?? []).includes(card)) return seat as SeatId;
  }
  return null;
}

/** Folds the swept piles into points and posts the round summary. */
const finishRound: Move<ScopaState> = {
  validate(state) {
    if (state.stage !== 'playing') return err('not-playing', 'the round already finished');
    if (!handsAllEmpty(state)) return err('hands-not-empty', 'cards are still unplayed');
    if (state.stock.length > 0) return err('stock-remaining', 'the deck is not exhausted');
    return true;
  },

  apply(state, _seat, _payload, ctx) {
    const scored = scoreRound({
      seats: state.seats,
      capturesBySeat: state.captures,
      scopeBySeat: state.scope,
      rules: state.rules,
    });
    const scores = state.scores.map((score, owner) => score + (scored.deltas[owner] ?? 0));

    const summary: RoundSummary = {
      roundNo: state.roundNo,
      dealer: state.dealer,
      cardsBySeat: state.captures.map((pile) => pile.length),
      scopeBySeat: [...state.scope],
      awards: scored.awards,
      deltasByOwner: scored.deltas,
      scoresAfter: scores,
      settebelloSeat: seatHolding(state, 'D7'),
      reDenariSeat: state.rules.reDenari ? seatHolding(state, 'D10') : null,
    };

    scored.awards.forEach((award, index) => {
      ctx.fx.emit(
        ScopaFx.Award,
        { kind: award.kind, owner: award.owner, points: award.points },
        index * AWARD_STAGGER_MS,
      );
    });
    ctx.fx.emit(
      ScopaFx.RoundScore,
      { roundNo: state.roundNo, deltas: scored.deltas, scores },
      scored.awards.length * AWARD_STAGGER_MS,
    );
    if (matchOver(scores, state.rules.target)) {
      ctx.fx.emit(Fx.RoundEnd, { reason: 'match-over' }, 240);
    }

    return {
      ...state,
      scores,
      summary,
      lastRound: summary,
      stage: 'round-over',
    };
  },
};

/** Rotates the dealer and lays the next tableau (redealing king-heavy ones). */
const nextRound: Move<ScopaState> = {
  validate(state, _seat, payload): true | RuleError {
    if (state.veiled && payload === undefined) {
      return {
        code: VEILED_REDEAL_PENDING,
        message: 'veiled round needs a fresh shuffle ceremony',
      };
    }
    return true;
  },

  apply(state, _seat, payload, ctx) {
    const dealer = advanceSeat(state.dealer, state.seats);
    const order = isVeiledDealPayload(payload)
      ? payload.deckOrder
      : ctx.rng.shuffle([...DECK.cardIds]);
    return openRound(
      {
        ...state,
        roundNo: state.roundNo + 1,
        dealer,
        summary: null,
        lastRound: state.summary ?? state.lastRound,
        veiled: state.veiled,
      },
      order,
      ctx.fx,
    );
  },
};

/**
 * Shuffles and deals one round, redealing when the opening tableau shows
 * three or more Kings. Rejected shuffles emit no fx — only the accepted deal
 * belongs on the animation timeline.
 *
 * When `order` is given (veiled rooms receive the ceremony's deck), it is
 * used as-is; the redeal-on-kings loop still runs but re-shuffles in-memory
 * since the ceremony only delivers one order per round.
 */
function openRound(
  base: ScopaState,
  orderOrRng: readonly CardId[] | Rng,
  fx: FxEmitter,
): ScopaState {
  const hasOrder = Array.isArray(orderOrRng);
  const order: readonly CardId[] = hasOrder
    ? orderOrRng
    : (orderOrRng as Rng).shuffle([...DECK.cardIds]);
  const rng: Rng | null = hasOrder ? null : (orderOrRng as Rng);
  let layout = dealLayout(order, base.seats, base.rules.scopone);
  // Redeal when the opening tableau shows three or more Kings. Under Veil the
  // ceremony only delivers one order, so a King-heavy one is allowed through
  // (the redeal limit is there for open-rooms only).
  if (rng) {
    let fresh: readonly CardId[] = order;
    for (let tries = 1; countKings(layout.table) >= 3; tries++) {
      if (tries > REDEAL_LIMIT) throw new Error('scopa: could not deal a clean tableau');
      fresh = rng.shuffle([...DECK.cardIds]);
      layout = dealLayout(fresh, base.seats, base.rules.scopone);
    }
  }

  const flights = layout.hands.flat().length;
  const stagger = Math.min(65, Math.floor(650 / Math.max(1, flights - 1)));
  let at = 0;
  const handRounds = base.rules.scopone ? (layout.hands[0]?.length ?? 0) : DEAL_PER_TURN;
  for (let round = 0; round < handRounds; round++) {
    for (let seat = 0; seat < base.seats; seat++) {
      fx.emit(Fx.DealCard, { card: '??', from: 'stock', to: `hand:${seat}`, dur: 220 }, at);
      at += stagger;
    }
  }
  for (let i = 0; i < layout.table.length; i++) {
    fx.emit(Fx.FlipCard, { card: '??', to: 'table' }, at);
    at += stagger;
  }

  return {
    ...base,
    hands: layout.hands,
    stock: layout.stock,
    table: layout.table,
    captures: Array.from({ length: base.seats }, () => []),
    scope: Array.from({ length: base.seats }, () => 0),
    lastCapturer: null,
    stage: 'playing',
    turn: ((base.dealer + 1) % base.seats) as SeatId,
  };
}

function phaseFor(state: ScopaState): PhaseState {
  if (state.stage === 'round-over') {
    return { phase: 'over', actor: null, round: state.roundNo, label: 'round-over' };
  }
  return { phase: 'playing', actor: state.turn, round: state.roundNo };
}

function legalMovesForSeat(state: ScopaState, seat: SeatId): LegalMove[] {
  if (state.stage !== 'playing' || state.turn !== seat) return [];
  return captureOptions(handOf(state, seat), state.table).map((option) => ({
    id: 'playCard',
    payload:
      option.take.length > 0
        ? { card: option.card, take: [...option.take] }
        : { card: option.card },
  }));
}

const flow: GameDef<ScopaState, ScopaRules>['flow'] = {
  start: (state) => phaseFor(state),

  legalMoves(state, phase) {
    if (phase.actor === null) return [];
    return legalMovesForSeat(state, phase.actor);
  },

  legalMovesFor(state, _phase, seat) {
    return legalMovesForSeat(state, seat);
  },

  advance(state, _event, _seats): FlowAdvance {
    if (state.stage === 'round-over') {
      const ended = matchResultFor(state);
      if (ended) return { phase: phaseFor(state), ended };
      // Under Veil the next round needs a shuffle ceremony the room runs
      // asynchronously; do not auto-move here — the room injects once it
      // has a fresh deck order.
      if (state.veiled) return { phase: phaseFor(state) };
      return {
        phase: phaseFor(state),
        autoMoves: [{ seat: null, move: 'nextRound', reason: 'next round' }],
      };
    }
    if (handsAllEmpty(state)) {
      if (state.stock.length > 0) {
        return {
          phase: phaseFor(state),
          autoMoves: [{ seat: null, move: 'deal', reason: 'hands empty' }],
        };
      }
      return {
        phase: phaseFor(state),
        autoMoves: [{ seat: null, move: 'finishRound', reason: 'deck exhausted' }],
      };
    }
    return { phase: phaseFor(state) };
  },

  canInject(_state, _phase, moveId, payload, _meta): true | RuleError {
    if (moveId === 'nextRound' && isVeiledDealPayload(payload)) return true;
    return { code: 'injection-unsupported', message: 'only veiled nextRound is injectable' };
  },
};

export interface ScopaDefOptions {
  bots?: readonly BotPolicy<ScopaState>[];
}

/**
 * The headless Scopa engine: a full match of rounds inside one deterministic
 * session. Scores live on the game state so the table snapshot and the match
 * never diverge.
 */
export function createScopaDef(options: ScopaDefOptions = {}): GameDef<ScopaState, ScopaRules> {
  const bots = options.bots ?? TIER_BOTS;
  return {
    id: GAME_ID,
    howToPlay: scopaHowToPlay,
    configSchema: scopaConfig,

    setup(ctx) {
      if (!(GAME_SEATS as readonly number[]).includes(ctx.seats)) {
        throw new Error(`scopa needs 2, 3, 4 or 6 seats, got ${ctx.seats}`);
      }
      const veiled = ctx.veiled === true;
      const base: ScopaState = {
        rules: ctx.config,
        seats: ctx.seats,
        veiled,
        roundNo: 1,
        dealer: 0,
        hands: Array.from({ length: ctx.seats }, () => []),
        stock: [],
        table: [],
        captures: Array.from({ length: ctx.seats }, () => []),
        scope: Array.from({ length: ctx.seats }, () => 0),
        lastCapturer: null,
        stage: 'playing',
        turn: 0,
        scores: Array.from({ length: ownerCount(ctx.seats) }, () => 0),
        summary: null,
        lastRound: null,
      };
      const order = veiled && ctx.deckOrder ? ctx.deckOrder : ctx.rng;
      return openRound(base, order, ctx.fx);
    },

    moves: { playCard, deal, finishRound, nextRound },

    flow,

    veil: scopaVeil,

    playerView(state, seat) {
      return {
        ...state,
        hands: state.hands.map((held, index) =>
          index === seat ? held.slice() : held.map(() => '??'),
        ),
        stock: state.stock.map(() => '??'),
      };
    },

    end(state) {
      return matchResultFor(state);
    },

    bots,
  };
}

export const scopaGame = createScopaDef();

/** playerView is a redacted ScopaState — same shape, hidden zones are `??`. */
export type ScopaPlayerView = ScopaState;

export function phaseForState(state: ScopaState): PhaseState {
  return phaseFor(state);
}
