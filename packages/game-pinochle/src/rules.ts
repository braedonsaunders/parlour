import {
  actingSeats,
  advanceSeat,
  dealOrder,
  Fx,
  isVeilHandle,
  isVeiledDealPayload,
  veilSupport,
  VEILED_REDEAL_PENDING,
  type BotPolicy,
  type CardId,
  type FlowAdvance,
  type GameDef,
  type LegalMove,
  type Move,
  type MoveCtx,
  type PhaseState,
  type RuleError,
  type SeatId,
} from '@parlour/engine';
import {
  emitTrickCollect,
  emitTrickPlay,
  followError,
  isTrickComplete,
  openTrick,
  playToTrick,
  resolveTrickWinner,
  trickCards,
} from '@parlour/tricks';
import { TIER_BOTS } from './bots';
import {
  HAND_SIZE,
  PINOCHLE_SEATS,
  PINOCHLE_SUITS,
  pinochleDeck,
  pinochleTrickRules,
  pointsOf,
  teamOf,
  TRICKS_PER_HAND,
  type PinochleSuit,
} from './cards';
import { MAX_BID, pinochleConfig, type PinochleRules } from './config';
import { pinochleHowToPlay } from './howto';
import { computeMeld, type MeldBreakdown } from './meld';
import { matchOver, matchResult, scoreHand } from './score';
import type { HandSummary, PinochleBid, PinochleState } from './state';

export const GAME_ID = 'pinochle';
const DECK = pinochleDeck();
const DEAL_STAGGER_MS = 50;
const COLLECT_DELAY_MS = 260;

export const PinochleFx = {
  Bid: 'pinochle.bid',
  AuctionWon: 'pinochle.auction-won',
  Redeal: 'pinochle.redeal',
  Trump: 'pinochle.trump',
  Meld: 'pinochle.meld',
  MeldComplete: 'pinochle.meld-complete',
  TrickCollect: 'pinochle.trick-collect',
  HandScore: 'pinochle.hand-score',
  Set: 'pinochle.set',
  ScoreChip: 'pinochle.score-chip',
} as const;

function err(code: string, message: string): RuleError {
  return { code, message };
}

function payloadBid(payload: unknown): number | null {
  const bid = (payload as { bid?: unknown } | undefined)?.bid;
  return typeof bid === 'number' && Number.isInteger(bid) ? bid : null;
}

function payloadSuit(payload: unknown): PinochleSuit | null {
  const suit = (payload as { suit?: unknown } | undefined)?.suit;
  return typeof suit === 'string' && (PINOCHLE_SUITS as readonly string[]).includes(suit)
    ? (suit as PinochleSuit)
    : null;
}

function payloadCard(payload: unknown): CardId | null {
  const card = (payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' && card.length > 0 ? card : null;
}

function hand(state: PinochleState, seat: SeatId): CardId[] {
  return state.hands[seat] ?? [];
}

function nextSeat(from: SeatId): SeatId {
  return advanceSeat(from, PINOCHLE_SEATS);
}

/** Rotates from `from` to the next seat still eligible to act in the auction. */
function nextActiveSeat(active: readonly SeatId[], from: SeatId): SeatId {
  if (active.length === 0) return from;
  let seat = advanceSeat(from, PINOCHLE_SEATS);
  for (let step = 0; step < PINOCHLE_SEATS; step++) {
    if (active.includes(seat)) return seat;
    seat = advanceSeat(seat, PINOCHLE_SEATS);
  }
  return from;
}

// ---------------------------------------------------------------------------
// dealing
// ---------------------------------------------------------------------------

interface FreshDeal {
  hands: CardId[][];
  dealer: SeatId;
  turn: SeatId;
}

/** Deals all 48 cards, twelve to a seat starting left of the dealer — no widow. */
function dealFreshHand(dealer: SeatId, order: readonly CardId[], fx: MoveCtx['fx']): FreshDeal {
  const hands: CardId[][] = [[], [], [], []];
  let cursor = 0;
  for (let cardIndex = 0; cardIndex < HAND_SIZE; cardIndex++) {
    for (let step = 1; step <= PINOCHLE_SEATS; step++) {
      const seat = advanceSeat(dealer, PINOCHLE_SEATS, step);
      const card = order[cursor++] as CardId;
      hands[seat]!.push(card);
      fx.emit(
        Fx.DealCard,
        { card: '??', from: 'stock', to: `hand:${seat}`, dur: 220 },
        (cursor - 1) * DEAL_STAGGER_MS,
      );
    }
  }
  return { hands, dealer, turn: nextSeat(dealer) };
}

function freshHand(
  base: PinochleState,
  dealt: FreshDeal,
  lastHand: HandSummary | null,
): PinochleState {
  return {
    ...base,
    hands: dealt.hands,
    dealer: dealt.dealer,
    turn: dealt.turn,
    stage: 'bidding',
    bids: [],
    activeBidders: [0, 1, 2, 3],
    highBid: null,
    highBidder: null,
    trump: null,
    melds: [null, null, null, null],
    meldConfirmed: [false, false, false, false],
    leader: null,
    trick: null,
    tricksPlayed: 0,
    trickWinners: [],
    tricksBySeat: [0, 0, 0, 0],
    trickPointsBySeat: [0, 0, 0, 0],
    summary: null,
    lastHand,
  };
}

function emptyMatch(config: PinochleRules, veiled = false): PinochleState {
  return {
    rules: config,
    veiled,
    scores: [0, 0],
    handNo: 1,
    dealer: 0,
    hands: [[], [], [], []],
    stage: 'bidding',
    turn: 1,
    bids: [],
    activeBidders: [0, 1, 2, 3],
    highBid: null,
    highBidder: null,
    trump: null,
    melds: [null, null, null, null],
    meldConfirmed: [false, false, false, false],
    leader: null,
    trick: null,
    tricksPlayed: 0,
    trickWinners: [],
    tricksBySeat: [0, 0, 0, 0],
    trickPointsBySeat: [0, 0, 0, 0],
    summary: null,
    lastHand: null,
  };
}

// ---------------------------------------------------------------------------
// player moves — the auction
// ---------------------------------------------------------------------------

function beginNamingTrump(state: PinochleState, ctx: MoveCtx): PinochleState {
  const bidder = state.highBidder as SeatId;
  ctx.fx.emit(PinochleFx.AuctionWon, { seat: bidder, team: teamOf(bidder), bid: state.highBid });
  ctx.fx.emit(Fx.TurnRing, { seat: bidder }, 140);
  return { ...state, stage: 'naming-trump', turn: bidder };
}

const bid: Move<PinochleState> = {
  validate(state, seat, payload) {
    if (state.stage !== 'bidding') return err('not-bidding', 'the auction is over');
    if (state.turn !== seat) return err('not-your-turn', 'another seat is bidding');
    if (!state.activeBidders.includes(seat))
      return err('already-passed', 'this seat already passed');
    const amount = payloadBid(payload);
    if (amount === null) return err('bad-bid', 'expected {bid}');
    const floor = state.highBid === null ? state.rules.minBid : state.highBid + 1;
    if (amount < floor) return err('bid-too-low', `bid must be at least ${floor}`);
    if (amount > MAX_BID) return err('bid-too-high', `bid cannot exceed ${MAX_BID}`);
    return true;
  },
  apply(state, seat, payload, ctx) {
    const amount = payloadBid(payload) as number;
    const bids: PinochleBid[] = [...state.bids, { seat, bid: amount }];
    ctx.fx.emit(PinochleFx.Bid, { seat, bid: amount });
    const next: PinochleState = { ...state, bids, highBid: amount, highBidder: seat };
    if (state.activeBidders.length === 1) return beginNamingTrump(next, ctx);
    const turn = nextActiveSeat(state.activeBidders, seat);
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, 120);
    return { ...next, turn };
  },
};

const pass: Move<PinochleState> = {
  validate(state, seat) {
    if (state.stage !== 'bidding') return err('not-bidding', 'the auction is over');
    if (state.turn !== seat) return err('not-your-turn', 'another seat is bidding');
    if (!state.activeBidders.includes(seat))
      return err('already-passed', 'this seat already passed');
    return true;
  },
  apply(state, seat, _payload, ctx) {
    ctx.fx.emit(PinochleFx.Bid, { seat, bid: null });
    const bids: PinochleBid[] = [...state.bids, { seat, bid: null }];
    const activeBidders = state.activeBidders.filter((active) => active !== seat);

    if (activeBidders.length === 0) {
      // nobody ever bid: throw the hand in and redeal from the same dealer
      ctx.fx.emit(PinochleFx.Redeal, { dealer: state.dealer });
      return { ...state, bids, activeBidders, stage: 'redeal', turn: state.dealer };
    }

    if (activeBidders.length === 1 && state.highBidder !== null) {
      return beginNamingTrump({ ...state, bids, activeBidders }, ctx);
    }

    const turn = nextActiveSeat(activeBidders, seat);
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, 120);
    return { ...state, bids, activeBidders, turn };
  },
};

const nameTrump: Move<PinochleState> = {
  validate(state, seat, payload) {
    if (state.stage !== 'naming-trump') return err('not-naming-trump', 'trump is already named');
    if (state.highBidder !== seat) return err('not-bidder', 'only the auction winner names trump');
    if (payloadSuit(payload) === null) return err('bad-suit', 'expected {suit} to be S, H, D or C');
    return true;
  },
  apply(state, seat, payload, ctx) {
    const suit = payloadSuit(payload) as PinochleSuit;
    ctx.fx.emit(PinochleFx.Trump, { seat, team: teamOf(seat), suit });
    return { ...state, stage: 'melding', trump: suit, turn: seat };
  },
};

// ---------------------------------------------------------------------------
// player moves — meld declaration
// ---------------------------------------------------------------------------

const confirmMeld: Move<PinochleState> = {
  validate(state, seat) {
    if (state.stage !== 'melding') return err('not-melding', 'meld is not being declared');
    if (state.meldConfirmed[seat])
      return err('already-confirmed', 'this seat already confirmed meld');
    if (state.trump === null) return err('no-trump', 'trump has not been named');
    if (hand(state, seat).some((card) => isVeilHandle(card))) {
      return err('card-still-veiled', 'meld needs the whole hand opened first');
    }
    return true;
  },
  apply(state, seat, _payload, ctx) {
    const trump = state.trump as PinochleSuit;
    const breakdown = computeMeld(hand(state, seat), trump);
    const melds = state.melds.map((existing, index) => (index === seat ? breakdown : existing));
    const meldConfirmed = state.meldConfirmed.map((existing, index) =>
      index === seat ? true : existing,
    );
    ctx.fx.emit(PinochleFx.Meld, { seat, team: teamOf(seat), breakdown });

    if (meldConfirmed.every(Boolean)) {
      const bidder = state.highBidder as SeatId;
      ctx.fx.emit(PinochleFx.MeldComplete, { leader: bidder });
      ctx.fx.emit(Fx.TurnRing, { seat: bidder }, 160);
      return { ...state, melds, meldConfirmed, stage: 'playing', turn: bidder, leader: bidder };
    }
    return { ...state, melds, meldConfirmed };
  },
};

// ---------------------------------------------------------------------------
// player moves — trick play
// ---------------------------------------------------------------------------

function followViolation(state: PinochleState, seat: SeatId, card: CardId): RuleError | null {
  const led = state.trick?.ledSuit;
  if (!led || !state.trump) return null;
  // A veiled hand is handles, so what a seat could have followed with is not
  // knowable here — audited after the match, same as Euchre/Hearts/Spades.
  if (state.veiled) return null;
  const fault = followError(
    { ledSuit: led, hand: hand(state, seat), card },
    pinochleTrickRules(state.trump),
  );
  return fault ? err('must-follow-suit', 'you must follow suit') : null;
}

const playCard: Move<PinochleState> = {
  validate(state, seat, payload) {
    if (state.stage !== 'playing') return err('not-playing', 'no trick in progress');
    if (state.turn !== seat) return err('not-your-turn', 'it is not your turn');
    const card = payloadCard(payload);
    if (!card) return err('bad-payload', 'expected {card}');
    if (isVeilHandle(card))
      return err('card-still-veiled', 'the played card has not been opened yet');
    if (!hand(state, seat).includes(card)) return err('not-in-hand', `${card} is not in the hand`);
    const violation = followViolation(state, seat, card);
    if (violation) return violation;
    return true;
  },
  apply(state, seat, payload, ctx) {
    const card = payloadCard(payload) as CardId;
    const trump = state.trump as PinochleSuit;
    const wasLeading = state.trick === null;
    const hands = state.hands.map((cards, index) =>
      index === seat ? cards.filter((held) => held !== card) : cards.slice(),
    );
    const trick = playToTrick(
      state.trick ?? openTrick(seat),
      seat,
      card,
      pinochleTrickRules(trump),
    );
    emitTrickPlay(ctx.fx, seat, card, trick.plays.length - 1);

    const base: PinochleState = {
      ...state,
      hands,
      trick,
      leader: wasLeading ? seat : state.leader,
    };

    if (!isTrickComplete(trick, PINOCHLE_SEATS)) {
      return { ...base, turn: nextSeat(seat) };
    }

    const cards = trickCards(trick);
    const winner = resolveTrickWinner(trick, pinochleTrickRules(trump)) ?? seat;
    const tricksPlayed = state.tricksPlayed + 1;
    const isLastTrick = tricksPlayed === TRICKS_PER_HAND;
    const trickPoints =
      cards.reduce((sum, played) => sum + pointsOf(played), 0) + (isLastTrick ? 10 : 0);
    emitTrickCollect(ctx.fx, winner, cards);
    ctx.fx.emit(
      PinochleFx.TrickCollect,
      { winner, team: teamOf(winner), cards, points: trickPoints, lastTrick: isLastTrick },
      COLLECT_DELAY_MS,
    );
    ctx.fx.emit(Fx.TurnRing, { seat: winner }, COLLECT_DELAY_MS + 60);
    const tricksBySeat = state.tricksBySeat.map((count, index) =>
      index === winner ? count + 1 : count,
    ) as unknown as PinochleState['tricksBySeat'];
    const trickPointsBySeat = state.trickPointsBySeat.map((points, index) =>
      index === winner ? points + trickPoints : points,
    ) as unknown as PinochleState['trickPointsBySeat'];
    return {
      ...base,
      trick: null,
      tricksPlayed,
      trickWinners: [...state.trickWinners, winner],
      tricksBySeat,
      trickPointsBySeat,
      leader: winner,
      turn: winner,
    };
  },
};

// ---------------------------------------------------------------------------
// system moves — scoring, redeal and the next deal
// ---------------------------------------------------------------------------

function emitHandBreakdown(fx: MoveCtx['fx'], summary: HandSummary): void {
  fx.emit(PinochleFx.HandScore, {
    handNo: summary.handNo,
    dealer: summary.dealer,
    bidWinner: summary.bidWinner,
    bidTeam: summary.bidTeam,
    bid: summary.bid,
    trump: summary.trump,
    set: summary.set,
    teams: summary.teams.map((team) => ({
      team: team.team,
      meld: team.meld,
      trickPoints: team.trickPoints,
      made: team.made,
      delta: team.delta,
      total: team.scoreAfter,
    })),
  });
  if (summary.set) {
    fx.emit(PinochleFx.Set, { team: summary.bidTeam, bid: summary.bid }, 120);
  }
  for (const team of summary.teams) {
    fx.emit(
      PinochleFx.ScoreChip,
      { team: team.team, delta: team.delta, total: team.scoreAfter },
      160,
    );
  }
}

const scoreHandMove: Move<PinochleState> = {
  validate: () => true,
  apply(state, _seat, _payload, ctx) {
    const bidWinner = state.highBidder;
    const bidAmount = state.highBid;
    if (bidWinner === null || bidAmount === null)
      throw new Error('scoreHand: no completed auction');
    const meldBySeat = state.melds as [MeldBreakdown, MeldBreakdown, MeldBreakdown, MeldBreakdown];
    const scored = scoreHand({
      handNo: state.handNo,
      dealer: state.dealer,
      bidWinner,
      bid: bidAmount,
      trump: state.trump as PinochleSuit,
      meldBySeat,
      tricksBySeat: state.tricksBySeat,
      trickPointsBySeat: state.trickPointsBySeat,
      priorScores: state.scores,
      rules: state.rules,
    });
    emitHandBreakdown(ctx.fx, scored.summary);
    if (matchOver(scored.scores, state.rules.target, scored.summary.bidTeam, scored.summary.set)) {
      ctx.fx.emit(Fx.RoundEnd, { reason: 'match-over' }, 240);
    }
    return {
      ...state,
      scores: scored.scores,
      summary: scored.summary,
      lastHand: scored.summary,
      stage: 'hand-over',
    };
  },
};

/**
 * All four seats passed with no bid ever placed: the hand is thrown in and
 * redealt by the same dealer. Open rooms shuffle for themselves; a veiled
 * room cannot (a deterministic reshuffle would be replayable by every seat),
 * so it waits for a deck the room's shuffle ceremony produced.
 */
const redealMove: Move<PinochleState> = {
  validate(state, _seat, payload) {
    if (state.veiled && !isVeiledDealPayload(payload)) {
      return {
        code: VEILED_REDEAL_PENDING,
        message: 'a veiled redeal needs its own shuffled deck',
      };
    }
    return true;
  },
  apply(state, _seat, payload, ctx) {
    const order = isVeiledDealPayload(payload)
      ? payload.deckOrder
      : ctx.rng.shuffle([...DECK.cardIds]);
    const dealt = dealFreshHand(state.dealer, order, ctx.fx);
    return freshHand({ ...state, handNo: state.handNo + 1 }, dealt, state.lastHand);
  },
};

const nextHand: Move<PinochleState> = {
  validate(state, _seat, payload) {
    if (state.veiled && !isVeiledDealPayload(payload)) {
      return { code: VEILED_REDEAL_PENDING, message: 'a veiled hand needs its own shuffled deck' };
    }
    return true;
  },
  apply(state, _seat, payload, ctx) {
    const dealer = nextSeat(state.dealer);
    const order = isVeiledDealPayload(payload)
      ? payload.deckOrder
      : ctx.rng.shuffle([...DECK.cardIds]);
    const dealt = dealFreshHand(dealer, order, ctx.fx);
    return freshHand({ ...state, handNo: state.handNo + 1, dealer }, dealt, state.lastHand);
  },
};

// ---------------------------------------------------------------------------
// flow
// ---------------------------------------------------------------------------

function matchEndResult(state: PinochleState) {
  if (!state.summary) return null;
  return matchResult(state.scores, state.rules.target, state.summary.bidTeam, state.summary.set);
}

function pendingMeldSeats(state: PinochleState): SeatId[] {
  return [0, 1, 2, 3].filter((seat) => !state.meldConfirmed[seat]);
}

function phaseFor(state: PinochleState): PhaseState {
  switch (state.stage) {
    case 'bidding':
      return { phase: 'bidding', actor: state.turn, round: state.handNo };
    case 'naming-trump':
      return {
        phase: 'naming-trump',
        actor: state.turn,
        round: state.handNo,
        label: 'auction winner names trump',
      };
    case 'melding': {
      const pending = pendingMeldSeats(state);
      return {
        phase: 'melding',
        actor: pending[0] ?? null,
        actors: pending,
        round: state.handNo,
        label: 'declaring meld',
      };
    }
    case 'playing':
      return { phase: 'playing', actor: state.turn, round: state.handNo };
    case 'redeal':
      return state.veiled
        ? { phase: 'redeal', actor: null, round: state.handNo, label: 'awaiting the redeal' }
        : { phase: 'redeal', actor: null, round: state.handNo };
    case 'hand-over':
      return state.veiled && matchEndResult(state) === null
        ? { phase: 'hand-over', actor: null, round: state.handNo, label: 'awaiting the next deal' }
        : { phase: 'over', actor: null, round: state.handNo };
  }
}

function legalBiddingMoves(state: PinochleState, seat: SeatId): LegalMove[] | null {
  if (state.stage !== 'bidding' || state.turn !== seat) return null;
  if (!state.activeBidders.includes(seat)) return [];
  const floor = state.highBid === null ? state.rules.minBid : state.highBid + 1;
  const bids: LegalMove[] = [];
  for (let amount = floor; amount <= MAX_BID; amount++) {
    bids.push({ id: 'bid', payload: { bid: amount } });
  }
  return [...bids, { id: 'pass' }];
}

function legalMovesForSeat(state: PinochleState, seat: SeatId): LegalMove[] {
  if (matchEndResult(state) && state.stage === 'hand-over') return [];

  const bidding = legalBiddingMoves(state, seat);
  if (bidding) return bidding;

  if (state.stage === 'naming-trump' && state.turn === seat) {
    return PINOCHLE_SUITS.map((suit) => ({ id: 'nameTrump', payload: { suit } }));
  }

  if (state.stage === 'melding' && !state.meldConfirmed[seat]) {
    return [{ id: 'confirmMeld' }];
  }

  if (state.stage === 'playing' && state.turn === seat && state.trump !== null) {
    if (state.veiled) return [{ id: 'playCard' }];
    return hand(state, seat)
      .filter((card) => followViolation(state, seat, card) === null)
      .map((card) => ({ id: 'playCard', payload: { card } }));
  }

  return [];
}

const flow: GameDef<PinochleState, PinochleRules>['flow'] = {
  start: (state) => phaseFor(state),

  legalMoves(state, phase) {
    return actingSeats(phase).flatMap((seat) => legalMovesForSeat(state, seat));
  },

  legalMovesFor(state, _phase, seat) {
    return legalMovesForSeat(state, seat);
  },

  advance(state, event, _seats): FlowAdvance {
    const ended = matchEndResult(state);
    if (ended && state.stage === 'hand-over') return { phase: phaseFor(state), ended };

    if (state.stage === 'redeal') {
      if (state.veiled) return { phase: phaseFor(state) };
      return {
        phase: phaseFor(state),
        autoMoves: [{ seat: null, move: 'redeal', reason: 'all-pass redeal' }],
      };
    }

    if (state.stage === 'hand-over') {
      if (state.veiled) return { phase: phaseFor(state) };
      return {
        phase: phaseFor(state),
        autoMoves: [{ seat: null, move: 'nextHand', reason: 'next deal' }],
      };
    }

    if (
      event.move === 'playCard' &&
      state.tricksPlayed === TRICKS_PER_HAND &&
      state.summary === null
    ) {
      return {
        phase: phaseFor(state),
        autoMoves: [{ seat: null, move: 'scoreHand', reason: 'twelve tricks played' }],
      };
    }

    return { phase: phaseFor(state) };
  },

  /**
   * The two system events a veiled pinochle match accepts: the next deal, and
   * a redeal after an all-pass auction. Both still run the move's own
   * validation, so an injected event cannot deal a hand the rules would
   * refuse.
   */
  canInject(state, _phase, moveId, payload) {
    if (moveId === 'nextHand') return nextHand.validate(state, state.dealer, payload);
    if (moveId === 'redeal') return redealMove.validate(state, state.dealer, payload);
    return { code: 'not-injectable', message: `pinochle does not accept injected ${moveId}` };
  },
};

// ---------------------------------------------------------------------------
// definition
// ---------------------------------------------------------------------------

export interface PinochleDefOptions {
  bots?: readonly BotPolicy<PinochleState>[];
}

/**
 * The headless Pinochle engine: a full partnership match — auction, meld and
 * twelve tricks — inside one deterministic session. Follow-suit enforcement
 * degrades to an audited-friends honour claim under Veil, and confirming
 * meld under Veil opens the whole hand (meld is computed from real cards).
 */
export function createPinochleDef(
  options: PinochleDefOptions = {},
): GameDef<PinochleState, PinochleRules> {
  const bots = options.bots ?? TIER_BOTS;
  return {
    id: GAME_ID,
    howToPlay: pinochleHowToPlay,
    configSchema: pinochleConfig,
    // No widow: all 48 cards are dealt, so nothing is opened at setup and a
    // fresh ceremony deck is needed every hand — including all-pass redeals.
    veil: veilSupport({
      deck: DECK,
      handSize: HAND_SIZE,
      publicSetup: 'none',
      redealMove: 'nextHand',
    }),

    setup(ctx) {
      if (!Number.isInteger(ctx.seats) || ctx.seats !== PINOCHLE_SEATS) {
        throw new Error(`pinochle needs exactly ${PINOCHLE_SEATS} seats`);
      }
      const order = dealOrder(ctx, DECK);
      return freshHand(
        emptyMatch(ctx.config, ctx.veiled === true),
        dealFreshHand(0, order, ctx.fx),
        null,
      );
    },

    moves: {
      bid,
      pass,
      nameTrump,
      confirmMeld,
      playCard,
      scoreHand: scoreHandMove,
      redeal: redealMove,
      nextHand,
    },

    flow,

    playerView(state, seat) {
      return {
        ...state,
        hands: state.hands.map((cards, index) =>
          index === seat ? cards.slice() : cards.map(() => '??'),
        ),
      };
    },

    end(state) {
      return matchEndResult(state);
    },

    bots,
  };
}

export const pinochleGame = createPinochleDef();

/** playerView is a redacted PinochleState — same shape, opponent hands are `??`. */
export type PinochlePlayerView = PinochleState;

export function phaseForState(state: PinochleState): PhaseState {
  return phaseFor(state);
}

export { teamOf };
