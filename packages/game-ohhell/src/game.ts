import {
  advanceSeat,
  Fx,
  veilSupport,
  type BotPolicy,
  type CardId,
  type FlowAdvance,
  type GameDef,
  type LegalMove,
  type Move,
  type MoveCtx,
  type PhaseState,
  type RuleError,
  type RuleValues,
  type SeatId,
} from '@parlour/engine';
import {
  emitTrickCollect,
  emitTrickPlay,
  followError,
  isTrickComplete,
  openTrick,
  playToTrick,
  trickCards,
} from '@parlour/tricks';
import { TIER_BOTS } from './bots';
import {
  MIN_SEATS,
  MAX_SEATS,
  SUITS,
  isSpecial,
  isWizard,
  ohhellDeck,
  ohhellTrickRules,
  resolveOhHellWinner,
  suitOfCard,
} from './cards';
import { ohhellConfig, type OhHellRules } from './config';
import { ohhellHowToPlay } from './howto';
import { planDeal } from './schedule';
import { buildSummary, rankByScore } from './score';
import type { OhHellState, RoundSummary } from './state';

export const GAME_ID = 'ohhell';

const DEAL_STAGGER_MS = 65;
const COLLECT_DELAY_MS = 260;

export const OhHellFx = {
  TrumpTurned: 'ohhell.trump-turned',
  TrumpChosen: 'ohhell.trump-chosen',
  Bid: 'ohhell.bid',
  BidsComplete: 'ohhell.bids-complete',
  RoundScore: 'ohhell.round-score',
} as const;

function err(code: string, message: string): RuleError {
  return { code, message };
}

function payloadBid(payload: unknown): number | null {
  const bid = (payload as { bid?: unknown } | undefined)?.bid;
  return typeof bid === 'number' && Number.isInteger(bid) ? bid : null;
}

function payloadCard(payload: unknown): CardId | null {
  const card = (payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' && card.length > 0 ? card : null;
}

function payloadSuit(payload: unknown): string | null {
  const suit = (payload as { suit?: unknown } | undefined)?.suit;
  return typeof suit === 'string' && SUITS.includes(suit) ? suit : null;
}

function hand(state: OhHellState, seat: SeatId): CardId[] {
  return state.hands[seat] ?? [];
}

function leftOf(seat: SeatId, seats: number): SeatId {
  return advanceSeat(seat, seats);
}

/**
 * The bid the hook rule forbids the dealer: exactly `handSize − otherBids`,
 * which would make the total bid equal the tricks available. Null whenever
 * the rule is off or the constraint cannot bite yet — the dealer bids last,
 * so while any other seat still owes a bid nothing is off the dial.
 */
export function forbiddenBid(
  state: Pick<OhHellState, 'rules' | 'bids' | 'dealer' | 'handSize'>,
): number | null {
  if (!state.rules.hookRule) return null;
  let others = 0;
  for (let seat = 0; seat < state.bids.length; seat++) {
    if (seat === state.dealer) continue;
    const bid = state.bids[seat];
    // A seat that has not bid leaves the dealer unconstrained; so does a seat
    // index the array does not carry, which is only reachable from a malformed
    // state but must not silently read as a zero bid.
    if (bid === null || bid === undefined) return null;
    others += bid;
  }
  const forbidden = state.handSize - others;
  return forbidden >= 0 && forbidden <= state.handSize ? forbidden : null;
}

/** Every bid value the seat may name — hook-forbidden values are absent entirely. */
export function allowedBids(
  state: Pick<OhHellState, 'rules' | 'bids' | 'dealer' | 'handSize'>,
  seat: SeatId,
): number[] {
  const banned = forbiddenBid(state);
  const bids: number[] = [];
  for (let value = 0; value <= state.handSize; value++) {
    if (seat === state.dealer && value === banned) continue;
    bids.push(value);
  }
  return bids;
}

function playFault(state: OhHellState, seat: SeatId, card: CardId): RuleError | null {
  if (!hand(state, seat).includes(card)) return err('not-in-hand', `${card} is not in the hand`);
  const led = state.trick?.ledSuit ?? null;
  if (led === null) return null;
  // A veiled hand is handles, so what a seat could have followed with is not
  // knowable here. The match-end audit recomputes every hand and catches a
  // revoke then — detection rather than prevention, as the protocol says.
  if (state.veiled) return null;
  // Wizards and Jesters follow no suit — they are always welcome in a trick.
  if (isSpecial(card)) return null;
  const fault = followError(
    { ledSuit: led, hand: hand(state, seat), card },
    ohhellTrickRules(state.trumpSuit),
  );
  return fault ? err('must-follow-suit', 'you must follow suit') : null;
}

function completedBids(state: OhHellState): number[] | null {
  if (state.bids.some((bid) => bid === null)) return null;
  return state.bids as number[];
}

interface FreshDeal {
  hands: CardId[][];
  stock: readonly CardId[];
  trumpCard: CardId | null;
  trumpSuit: string | null;
  handSize: number;
  turnedWizard: boolean;
}

function dealRound(
  dealer: SeatId,
  seats: number,
  rules: OhHellRules,
  order: readonly CardId[],
  fx: MoveCtx['fx'],
): FreshDeal {
  const plan = planDeal(rules.handSize, seats, rules.wizards, rules.trumpOnLastRound);
  const hands: CardId[][] = Array.from({ length: seats }, () => [] as CardId[]);
  let cursor = 0;
  for (let cardIndex = 0; cardIndex < plan.handSize; cardIndex++) {
    for (let step = 1; step <= seats; step++) {
      const seat = (dealer + step) % seats;
      const card = order[cursor++] as CardId;
      hands[seat]!.push(card);
      fx.emit(
        Fx.DealCard,
        { card: '??', from: 'stock', to: `hand:${seat}`, dur: 220 },
        (cursor - 1) * DEAL_STAGGER_MS,
      );
    }
  }

  if (plan.wholeDeck) {
    // The deal consumed the deck: there is no card to turn. This round is
    // no-trump — refusing to crash here is THE classic Oh Hell implementation bug.
    return {
      hands,
      stock: [],
      trumpCard: null,
      trumpSuit: null,
      handSize: plan.handSize,
      turnedWizard: false,
    };
  }

  const trumpCard = order[cursor] as CardId;
  const stock: readonly CardId[] = order.slice(cursor + 1);
  const kind = suitOfCard(trumpCard);
  fx.emit(Fx.FlipCard, { card: trumpCard, seat: 'stock' }, plan.handSize * seats * DEAL_STAGGER_MS);
  fx.emit(OhHellFx.TrumpTurned, { card: trumpCard, suit: kind });
  return {
    hands,
    stock,
    trumpCard,
    // A turned Wizard hands the choice to the dealer; a Jester means no trump.
    trumpSuit: kind,
    handSize: plan.handSize,
    turnedWizard: isWizard(trumpCard),
  };
}

function emptyRound(
  config: OhHellRules,
  seats: number,
  dealt: FreshDeal,
  veiled = false,
): OhHellState {
  return {
    rules: config,
    seats,
    veiled,
    stage: dealt.turnedWizard ? 'trumping' : 'bidding',
    handSize: dealt.handSize,
    dealer: config.dealer,
    stock: dealt.stock,
    trumpCard: dealt.trumpCard,
    trumpSuit: dealt.trumpSuit,
    hands: dealt.hands,
    bids: Array.from({ length: seats }, () => null),
    turn: dealt.turnedWizard ? config.dealer : leftOf(config.dealer, seats),
    leader: null,
    trick: null,
    tricksWon: Array.from({ length: seats }, () => 0),
    tricksPlayed: 0,
    played: [],
    summary: null,
  };
}

const chooseTrump: Move<OhHellState> = {
  validate(state, seat, payload) {
    if (state.stage !== 'trumping') return err('not-choosing', 'no trump choice is owed');
    if (state.turn !== seat || seat !== state.dealer)
      return err('not-your-turn', 'only the dealer chooses trump');
    return payloadSuit(payload) !== null
      ? true
      : err('bad-suit', 'expected {suit} to be a real suit');
  },
  apply(state, _seat, payload, ctx) {
    const suit = payloadSuit(payload) as string;
    ctx.fx.emit(OhHellFx.TrumpChosen, { seat: state.dealer, suit });
    const turn = leftOf(state.dealer, state.seats);
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, 120);
    return { ...state, trumpSuit: suit, stage: 'bidding', turn };
  },
};

function applyBidRecord(
  state: OhHellState,
  seat: SeatId,
  value: number,
  ctx: MoveCtx,
): OhHellState {
  const bids = state.bids.map((existing, index) => (index === seat ? value : existing));
  ctx.fx.emit(OhHellFx.Bid, { seat, bid: value });

  if (bids.some((bid) => bid === null)) {
    const next = advanceSeat(seat, state.seats);
    ctx.fx.emit(Fx.TurnRing, { seat: next }, 120);
    return { ...state, bids, turn: next };
  }

  const lead = leftOf(state.dealer, state.seats);
  ctx.fx.emit(OhHellFx.BidsComplete, { bids, tricksAvailable: state.handSize, leader: lead });
  ctx.fx.emit(Fx.TurnRing, { seat: lead }, 160);
  return { ...state, bids, stage: 'playing', turn: lead, leader: lead };
}

const bid: Move<OhHellState> = {
  validate(state, seat, payload) {
    if (state.stage !== 'bidding') return err('not-bidding', 'the bidding is over');
    if (state.turn !== seat) return err('not-your-turn', 'another seat is bidding');
    if (state.bids[seat] !== null) return err('already-bid', 'this seat has already bid');
    const value = payloadBid(payload);
    if (value === null || value < 0 || value > state.handSize) {
      return err('bad-bid', `expected {bid} in 0..${state.handSize}`);
    }
    if (forbiddenBid(state) === value) {
      return err('hook-forbidden', 'the hook rule forbids making every bid come out exact');
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const value = payloadBid(payload) as number;
    return applyBidRecord(state, seat, value, ctx);
  },
};

const playCard: Move<OhHellState> = {
  validate(state, seat, payload) {
    if (state.stage !== 'playing') return err('not-playing', 'no trick in progress');
    if (state.turn !== seat) return err('not-your-turn', 'it is not your turn');
    const card = payloadCard(payload);
    if (!card) return err('bad-play', 'expected {card}');
    const fault = playFault(state, seat, card);
    return fault ?? true;
  },
  apply(state, seat, payload, ctx) {
    const card = payloadCard(payload) as CardId;
    const rules = ohhellTrickRules(state.trumpSuit);
    const hands = state.hands.map((cards, index) =>
      index === seat ? cards.filter((held) => held !== card) : cards.slice(),
    );
    const trick = playToTrick(state.trick ?? openTrick(seat), seat, card, rules);
    const played = [...state.played, { seat, card }];
    emitTrickPlay(ctx.fx, seat, card, trick.plays.length - 1);

    const base: OhHellState = { ...state, hands, trick, played };

    if (!isTrickComplete(trick, state.seats)) {
      return { ...base, turn: advanceSeat(seat, state.seats) };
    }

    const cards = trickCards(trick);
    const winner = resolveOhHellWinner(trick, state.trumpSuit) ?? seat;
    emitTrickCollect(ctx.fx, winner, cards);
    ctx.fx.emit(Fx.TurnRing, { seat: winner }, COLLECT_DELAY_MS + 60);
    return {
      ...base,
      trick: null,
      tricksPlayed: state.tricksPlayed + 1,
      tricksWon: state.tricksWon.map((count, index) => (index === winner ? count + 1 : count)),
      leader: winner,
      turn: winner,
    };
  },
};

function emitRoundBreakdown(fx: MoveCtx['fx'], summary: RoundSummary): void {
  fx.emit(OhHellFx.RoundScore, {
    dealer: summary.dealer,
    trumpSuit: summary.trumpSuit,
    rows: summary.bids.map((bid, seat) => ({
      seat,
      bid,
      taken: summary.tricksWon[seat],
      points: summary.points[seat],
    })),
  });
  fx.emit(Fx.RoundEnd, { reason: 'round-complete' }, 180);
}

const scoreRound: Move<OhHellState> = {
  validate: () => true,
  apply(state, _seat, _payload, ctx) {
    const bids = completedBids(state);
    if (!bids) throw new Error('scoreRound: bidding is incomplete');
    const summary = buildSummary({
      handSize: state.handSize,
      dealer: state.dealer,
      trumpSuit: state.trumpSuit,
      bids,
      tricksWon: state.tricksWon,
      scheme: state.rules.scoring,
    });
    emitRoundBreakdown(ctx.fx, summary);
    return {
      ...state,
      summary,
      stage: 'over',
      trick: null,
      leader: null,
      turn: state.leader ?? state.dealer,
    };
  },
};

function endResult(state: OhHellState) {
  if (state.summary === null) return null;
  const summary = state.summary;
  const ranked = rankByScore(summary.points, 'round-complete', (seat) => ({
    bid: summary.bids[seat] ?? 0,
    taken: summary.tricksWon[seat] ?? 0,
    points: summary.points[seat] ?? 0,
  }));
  return { winner: ranked.winner, rankings: ranked.rankings, reason: 'round-complete' };
}

function phaseFor(state: OhHellState): PhaseState {
  return {
    phase: state.stage,
    actor: state.stage === 'over' ? null : state.turn,
    round: 1,
  };
}

function legalMovesForSeat(state: OhHellState, seat: SeatId): LegalMove[] {
  if (state.stage === 'trumping' && state.turn === seat && seat === state.dealer) {
    return SUITS.map((suit) => ({ id: 'chooseTrump', payload: { suit } }));
  }
  if (state.stage === 'bidding' && state.turn === seat && state.bids[seat] === null) {
    return allowedBids(state, seat).map((value) => ({ id: 'bid', payload: { bid: value } }));
  }
  if (state.stage === 'playing' && state.turn === seat) {
    // Under Veil only this seat can read its hand, so the move is offered
    // without a card and the opening travels with it.
    if (state.veiled) return [{ id: 'playCard' }];
    return hand(state, seat)
      .filter((card) => playFault(state, seat, card) === null)
      .map((card) => ({ id: 'playCard', payload: { card } }));
  }
  return [];
}

/**
 * Hands, then the card turned for trump.
 *
 * A friend room plays one deal, so there is no redeal move: the hand-size arc
 * and dealer rotation that make a *match* stay solo-only. The turned trump is
 * the one public opening, unless the deal consumed the whole deck — the classic
 * Oh Hell edge case, where there is no card left to turn and the round is
 * no-trump.
 */
const ohhellVeil = veilSupport({
  deck: (config: RuleValues) => ohhellDeck((config as unknown as OhHellRules).wizards),
  handSize: (config: RuleValues, seats: number) => {
    const rules = config as unknown as OhHellRules;
    return planDeal(rules.handSize, seats, rules.wizards, rules.trumpOnLastRound).handSize;
  },
  // One card turned for trump — or none, when the deal consumed the whole deck
  // and the round is no-trump. The room opens what it can and stops.
  publicSetup: (opened: readonly CardId[]) => opened.length <= 1,
});

const flow: GameDef<OhHellState, OhHellRules>['flow'] = {
  start: (state) => phaseFor(state),

  legalMoves(state, phase) {
    if (phase.actor === null) return [];
    return legalMovesForSeat(state, phase.actor);
  },

  legalMovesFor(state, _phase, seat) {
    return legalMovesForSeat(state, seat);
  },

  advance(state, event, _seats): FlowAdvance {
    const ended = endResult(state);
    if (ended && state.stage === 'over') return { phase: phaseFor(state), ended };

    if (
      event.move === 'playCard' &&
      state.stage === 'playing' &&
      state.tricksPlayed === state.handSize &&
      state.summary === null
    ) {
      return {
        phase: phaseFor(state),
        autoMoves: [{ seat: null, move: 'scoreRound', reason: 'all tricks played' }],
      };
    }

    return { phase: phaseFor(state) };
  },
};

export interface OhHellDefOptions {
  bots?: readonly BotPolicy<OhHellState>[];
}

/**
 * The headless Oh Hell round engine: one deal, one bidding pass, handSize
 * tricks, a scored summary. A full match is MatchDef over this (see match.ts).
 */
export function createOhHellDef(options: OhHellDefOptions = {}): GameDef<OhHellState, OhHellRules> {
  const bots = options.bots ?? TIER_BOTS;
  return {
    id: GAME_ID,
    howToPlay: ohhellHowToPlay,
    configSchema: ohhellConfig,

    veil: ohhellVeil,

    setup(ctx) {
      if (!Number.isInteger(ctx.seats) || ctx.seats < MIN_SEATS || ctx.seats > MAX_SEATS) {
        throw new Error(`ohhell needs ${MIN_SEATS} to ${MAX_SEATS} seats`);
      }
      const deck = ohhellDeck(ctx.config.wizards);
      // A veiled room deals from the order its ceremony produced, with the
      // trump card already turned face up at its position in that order.
      const order = ctx.deckOrder ?? ctx.rng.shuffle([...deck.cardIds]);
      const dealt = dealRound(ctx.config.dealer, ctx.seats, ctx.config, order, ctx.fx);
      return emptyRound(ctx.config, ctx.seats, dealt, ctx.veiled === true);
    },

    moves: {
      chooseTrump,
      bid,
      playCard,
      scoreRound,
    },

    flow,

    playerView(state, seat) {
      return {
        ...state,
        hands: state.hands.map((cards, index) =>
          index === seat ? cards.slice() : cards.map(() => '??'),
        ),
        stock: state.stock.map(() => '??'),
      };
    },

    end(state) {
      return endResult(state);
    },

    bots,
  };
}

export const ohhellGame = createOhHellDef();

/** playerView is a redacted OhHellState — same shape, hidden zones are `??`. */
export type OhHellPlayerView = OhHellState;

export function phaseForState(state: OhHellState): PhaseState {
  return phaseFor(state);
}
