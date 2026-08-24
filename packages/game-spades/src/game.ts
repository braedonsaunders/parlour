import {
  Fx,
  dealOrder,
  isVeilHandle,
  veilHandleIndex,
  veilSupport,
  stateContainsCardId,
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
  DECK,
  DECK_SIZE,
  HAND_SIZE,
  SPADES_SEATS,
  SUIT_SPADES,
  TRICKS_PER_HAND,
  allSpades,
  isRealCard,
  isSpade,
  spadesTrickRules,
  teamOf,
} from './cards';
import { spadesConfig, type SpadesRules } from './config';
import { spadesHowToPlay } from './howto';
import { matchOver, matchResult, scoreHand } from './score';
import type { HandSummary, SpadesBid, SpadesState } from './state';

export const GAME_ID = 'spades';

const DEAL_STAGGER_MS = 65;
const COLLECT_DELAY_MS = 260;

export const SpadesFx = {
  Bid: 'spades.bid',
  BidsComplete: 'spades.bids-complete',
  TrickCollect: 'spades.trick-collect',
  SpadesBroken: 'spades.spades-broken',
  NilMade: 'spades.nil-made',
  NilFailed: 'spades.nil-failed',
  HandScore: 'spades.hand-score',
  BagPenalty: 'spades.bag-penalty',
  ScoreChip: 'spades.score-chip',
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

function payloadClaim(payload: unknown): 'all-spades' | null {
  const claim = (payload as { claim?: unknown } | undefined)?.claim;
  return claim === 'all-spades' ? 'all-spades' : null;
}

function payloadDeckOrder(payload: unknown): readonly CardId[] | null {
  const order = (payload as { deckOrder?: unknown } | undefined)?.deckOrder;
  if (!Array.isArray(order) || order.length !== DECK_SIZE) return null;
  return order.every((id) => typeof id === 'string' && id.length > 0) ? (order as CardId[]) : null;
}

function hand(state: SpadesState, seat: SeatId): CardId[] {
  return state.hands[seat] ?? [];
}

function nextSeat(from: SeatId): SeatId {
  return (from + 1) % SPADES_SEATS;
}

function leftOfDealer(dealer: SeatId): SeatId {
  return nextSeat(dealer);
}

function regularBids(): number[] {
  return Array.from({ length: 13 }, (_, index) => index + 1);
}

interface FreshDeal {
  hands: CardId[][];
  dealer: SeatId;
  turn: SeatId;
}

function dealFreshHand(dealer: SeatId, order: readonly CardId[], fx: MoveCtx['fx']): FreshDeal {
  const hands: CardId[][] = [[], [], [], []];
  let cursor = 0;
  for (let cardIndex = 0; cardIndex < HAND_SIZE; cardIndex++) {
    for (let step = 1; step <= SPADES_SEATS; step++) {
      const seat = (dealer + step) % SPADES_SEATS;
      const card = order[cursor++] as CardId;
      hands[seat]!.push(card);
      fx.emit(
        Fx.DealCard,
        { card, from: 'stock', to: `hand:${seat}`, dur: 220 },
        (cursor - 1) * DEAL_STAGGER_MS,
      );
    }
  }
  return { hands, dealer, turn: leftOfDealer(dealer) };
}

function emptyMatch(config: SpadesRules, veiled: boolean): SpadesState {
  return {
    rules: config,
    veiled,
    scores: [0, 0],
    bags: [0, 0],
    handNo: 1,
    dealer: 0,
    hands: [[], [], [], []],
    stage: 'bidding',
    turn: 1,
    bids: [null, null, null, null],
    leader: null,
    trick: null,
    tricksPlayed: 0,
    trickWinners: [],
    tricksBySeat: [0, 0, 0, 0],
    spadesBroken: false,
    plays: [],
    summary: null,
    lastHand: null,
    lastHandSummary: null,
  };
}

function freshHand(base: SpadesState, dealt: FreshDeal, lastHand: HandSummary | null): SpadesState {
  return {
    ...base,
    hands: dealt.hands,
    dealer: dealt.dealer,
    turn: dealt.turn,
    stage: 'bidding',
    bids: [null, null, null, null],
    leader: null,
    trick: null,
    tricksPlayed: 0,
    trickWinners: [],
    tricksBySeat: [0, 0, 0, 0],
    spadesBroken: false,
    plays: [],
    summary: null,
    lastHand,
    lastHandSummary: lastHand,
  };
}

function completedBids(state: SpadesState): SpadesBid[] | null {
  if (state.bids.some((bid) => bid === null)) return null;
  return state.bids as SpadesBid[];
}

function claimVerified(state: SpadesState, seat: SeatId): boolean {
  const cards = hand(state, seat);
  return cards.every(isRealCard) && allSpades(cards);
}

function leadViolation(state: SpadesState, seat: SeatId, card: CardId): RuleError | null {
  if (state.trick !== null) return null;
  if (!isSpade(card)) return null;
  if (state.spadesBroken) return null;
  if (state.veiled) {
    return err('bad-claim', 'leading an unbroken spade under Veil needs an opened all-spades claim');
  }
  if (allSpades(hand(state, seat))) return null;
  return err('spades-not-broken', 'spades have not been broken yet');
}

function followViolation(state: SpadesState, seat: SeatId, card: CardId): RuleError | null {
  const led = state.trick?.ledSuit;
  if (!led) return null;
  const fault = followError({ ledSuit: led, hand: hand(state, seat), card }, spadesTrickRules());
  return fault ? err('must-follow-suit', 'you must follow suit') : null;
}

function applyBidRecord(
  state: SpadesState,
  seat: SeatId,
  record: SpadesBid,
  ctx: MoveCtx,
): SpadesState {
  const bids = state.bids.map((existing, index) => (index === seat ? record : existing));
  ctx.fx.emit(SpadesFx.Bid, {
    seat,
    bid: record.nil ? 0 : record.tricks,
    nil: record.nil,
    team: teamOf(seat),
  });

  if (bids.some((entry) => entry === null)) {
    const next = nextSeat(seat);
    ctx.fx.emit(Fx.TurnRing, { seat: next }, 120);
    return { ...state, bids, turn: next };
  }

  const lead = leftOfDealer(state.dealer);
  const contracts = [teamContractOf(bids as SpadesBid[], 0), teamContractOf(bids as SpadesBid[], 1)];
  ctx.fx.emit(SpadesFx.BidsComplete, {
    bids,
    contracts,
    leader: lead,
  });
  ctx.fx.emit(Fx.TurnRing, { seat: lead }, 160);
  return { ...state, bids, stage: 'playing', turn: lead, leader: lead };
}

function teamContractOf(bids: readonly SpadesBid[], team: 0 | 1): number {
  return bids.reduce((sum, bid) => (teamOf(bid.seat) === team && !bid.nil ? sum + bid.tricks : sum), 0);
}

const bid: Move<SpadesState> = {
  validate(state, seat, payload) {
    if (state.stage !== 'bidding') return err('not-bidding', 'the bidding is over');
    if (state.turn !== seat) return err('not-your-turn', 'another seat is bidding');
    if (state.bids[seat] !== null) return err('already-bid', 'this seat has already bid');
    const value = payloadBid(payload);
    if (value === null || value < 1 || value > 13) {
      return err('bad-bid', 'expected {bid} in 1..13');
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const value = payloadBid(payload) as number;
    return applyBidRecord(state, seat, { seat, tricks: value, nil: false }, ctx);
  },
};

const bidNil: Move<SpadesState> = {
  validate(state, seat) {
    if (state.stage !== 'bidding') return err('not-bidding', 'the bidding is over');
    if (state.turn !== seat) return err('not-your-turn', 'another seat is bidding');
    if (state.bids[seat] !== null) return err('already-bid', 'this seat has already bid');
    if (!state.rules.nil) return err('nil-disabled', 'nil is off at this table');
    return true;
  },
  apply(state, seat, _payload, ctx) {
    return applyBidRecord(state, seat, { seat, tricks: 0, nil: true }, ctx);
  },
};

const playCard: Move<SpadesState> = {
  validate(state, seat, payload) {
    if (state.stage !== 'playing') return err('not-playing', 'no trick in progress');
    if (state.turn !== seat) return err('not-your-turn', 'it is not your turn');
    const card = payloadCard(payload);
    if (!card) return err('bad-play', 'expected {card}');
    if (isVeilHandle(card)) return err('card-still-veiled', 'the played card has not been opened yet');
    if (!hand(state, seat).includes(card)) return err('not-in-hand', `${card} is not in the hand`);

    if (state.trick === null && isSpade(card) && !state.spadesBroken) {
      if (!state.veiled) return leadViolation(state, seat, card) ?? true;
      if (payloadClaim(payload) !== 'all-spades' || !claimVerified(state, seat)) {
        return err(
          'bad-claim',
          'leading an unbroken spade under Veil needs an opened all-spades claim',
        );
      }
    }

    if (!state.veiled) {
      const follow = followViolation(state, seat, card);
      if (follow) return follow;
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const card = payloadCard(payload) as CardId;
    const wasLeading = state.trick === null;
    const hands = state.hands.map((cards, index) =>
      index === seat ? cards.filter((held) => held !== card) : cards.slice(),
    );
    const trick = playToTrick(state.trick ?? openTrick(seat), seat, card, spadesTrickRules());
    const plays = [...state.plays, { seat, card }];
    emitTrickPlay(ctx.fx, seat, card, trick.plays.length - 1);

    let spadesBroken = state.spadesBroken;
    if (isSpade(card) && !spadesBroken) {
      const sloughed = !wasLeading && trick.ledSuit !== SUIT_SPADES;
      spadesBroken = true;
      ctx.fx.emit(SpadesFx.SpadesBroken, { seat, card, how: sloughed ? 'slough' : 'lead' });
    }

    const base: SpadesState = {
      ...state,
      hands,
      trick,
      plays,
      spadesBroken,
      leader: wasLeading ? seat : state.leader,
    };

    if (!isTrickComplete(trick, SPADES_SEATS)) {
      return { ...base, turn: nextSeat(seat) };
    }

    const cards = trickCards(trick);
    const winner = resolveTrickWinner(trick, spadesTrickRules()) ?? seat;
    emitTrickCollect(ctx.fx, winner, cards);
    ctx.fx.emit(
      SpadesFx.TrickCollect,
      { winner, team: teamOf(winner), cards, count: cards.length },
      COLLECT_DELAY_MS,
    );
    const tricksPlayed = state.tricksPlayed + 1;
    const tricksBySeat = state.tricksBySeat.map((count, index) =>
      index === winner ? count + 1 : count,
    );
    ctx.fx.emit(Fx.TurnRing, { seat: winner }, COLLECT_DELAY_MS + 60);
    return {
      ...base,
      trick: null,
      tricksPlayed,
      trickWinners: [...state.trickWinners, winner],
      tricksBySeat,
      leader: winner,
      turn: winner,
    };
  },
};

function emitHandBreakdown(fx: MoveCtx['fx'], summary: HandSummary): void {
  const payload = {
    handNo: summary.handNo,
    dealer: summary.dealer,
    bids: summary.bids,
    tricksBySeat: summary.tricksBySeat,
    teams: summary.teams.map((team) => ({
      team: team.team,
      contract: team.contract,
      nonNilTricks: team.nonNilTricks,
      nilTricks: team.nilTricks,
      made: team.made,
      contractDelta: team.contractDelta,
      nilDelta: team.nilDelta,
      overtricks: team.overtricks,
      bagsTaken: team.bagsTaken,
      bagPenalty: team.bagPenalty,
      delta: team.delta,
      total: team.scoreAfter,
      bags: team.bagsAfter,
    })),
  };
  fx.emit(SpadesFx.HandScore, payload);
  for (const bid of summary.bids) {
    if (!bid.nil) continue;
    const taken = summary.tricksBySeat[bid.seat] ?? 0;
    fx.emit(taken === 0 ? SpadesFx.NilMade : SpadesFx.NilFailed, {
      seat: bid.seat,
      team: teamOf(bid.seat),
      tricks: taken,
    });
  }
  for (const team of summary.teams) {
    if (team.bagPenalty > 0) {
      fx.emit(SpadesFx.BagPenalty, {
        team: team.team,
        penalty: team.bagPenalty,
        bags: team.bagsAfter,
      });
    }
    fx.emit(
      SpadesFx.ScoreChip,
      { team: team.team, delta: team.delta, total: team.scoreAfter, bags: team.bagsAfter },
      120,
    );
  }
}

const scoreHandMove: Move<SpadesState> = {
  validate: () => true,
  apply(state, _seat, _payload, ctx) {
    const bids = completedBids(state);
    if (!bids) throw new Error('scoreHand: bidding is incomplete');
    const scored = scoreHand({
      handNo: state.handNo,
      dealer: state.dealer,
      bids,
      tricksBySeat: state.tricksBySeat,
      priorScores: state.scores,
      priorBags: state.bags,
      rules: state.rules,
    });
    emitHandBreakdown(ctx.fx, scored.summary);
    if (matchOver(scored.scores, state.rules.targetScore)) {
      ctx.fx.emit(Fx.RoundEnd, { reason: 'match-over' }, 240);
    }
    return {
      ...state,
      scores: scored.scores,
      bags: scored.bags,
      summary: scored.summary,
      lastHand: scored.summary,
      lastHandSummary: scored.summary,
      stage: 'hand-over',
    };
  },
};

const nextHand: Move<SpadesState> = {
  validate: () => true,
  apply(state, _seat, payload, ctx) {
    const dealer = nextSeat(state.dealer);
    let order: readonly CardId[];
    const ceremonyOrder = payloadDeckOrder(payload);
    if (state.veiled) {
      if (!ceremonyOrder) throw new Error('nextHand: veiled rooms require {deckOrder}');
      order = ceremonyOrder;
    } else {
      if (ceremonyOrder) throw new Error('nextHand: open rooms shuffle for themselves');
      order = ctx.rng.shuffle(DECK.cardIds);
    }
    const dealt = dealFreshHand(dealer, order, ctx.fx);
    return freshHand(
      { ...state, handNo: state.handNo + 1, dealer },
      dealt,
      state.lastHand ?? state.lastHandSummary ?? state.summary,
    );
  },
};

function matchEndResult(state: SpadesState) {
  if (state.summary === null && state.lastHandSummary === null) return null;
  const ended = matchResult(state.scores, state.bags, state.rules.targetScore);
  if (!ended) return null;
  // Only end once the just-finished hand has been folded (stage hand-over, or
  // a subsequent deal that kept lastHandSummary after a crossing hand).
  if (state.stage !== 'hand-over' && !matchOver(state.scores, state.rules.targetScore)) return null;
  if (state.stage !== 'hand-over') return ended;
  return ended;
}

function phaseFor(state: SpadesState): PhaseState {
  switch (state.stage) {
    case 'bidding':
      return { phase: 'bidding', actor: state.turn, round: state.handNo };
    case 'playing':
      return { phase: 'playing', actor: state.turn, round: state.handNo };
    case 'hand-over':
      return state.veiled && !matchOver(state.scores, state.rules.targetScore)
        ? { phase: 'hand-over', actor: null, round: state.handNo, label: 'awaiting the next deal' }
        : { phase: 'over', actor: null, round: state.handNo };
  }
}

function legalMovesForSeat(state: SpadesState, seat: SeatId): LegalMove[] {
  if (matchEndResult(state) && state.stage === 'hand-over') return [];

  if (state.stage === 'bidding' && state.turn === seat) {
    const regular = regularBids().map((value) => ({ id: 'bid', payload: { bid: value } }));
    return state.rules.nil ? [...regular, { id: 'bidNil' }] : regular;
  }

  if (state.stage === 'playing' && state.turn === seat) {
    const cards = hand(state, seat).filter((card) => {
      if (state.veiled) {
        if (state.trick === null && isSpade(card) && !state.spadesBroken) {
          return claimVerified(state, seat);
        }
        return isRealCard(card) || isVeilHandle(card);
      }
      if (leadViolation(state, seat, card)) return false;
      if (followViolation(state, seat, card)) return false;
      return true;
    });
    return cards.map((card) => {
      const needsClaim =
        state.veiled &&
        state.trick === null &&
        isSpade(card) &&
        !state.spadesBroken;
      return {
        id: 'playCard',
        payload: needsClaim ? { card, claim: 'all-spades' } : { card },
      };
    });
  }

  return [];
}

const flow: GameDef<SpadesState, SpadesRules>['flow'] = {
  start: (state) => phaseFor(state),

  legalMoves(state, phase) {
    if (phase.actor === null) return [];
    return legalMovesForSeat(state, phase.actor);
  },

  legalMovesFor(state, _phase, seat) {
    return legalMovesForSeat(state, seat);
  },

  advance(state, event, _seats): FlowAdvance {
    const ended = matchEndResult(state);
    if (ended && state.stage === 'hand-over') return { phase: phaseFor(state), ended };

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
        autoMoves: [{ seat: null, move: 'scoreHand', reason: 'thirteen tricks played' }],
      };
    }

    return { phase: phaseFor(state) };
  },

  canInject(state, phase, moveId, payload) {
    if (moveId !== 'spades.hand.order') {
      return err('bad-injection', `${moveId} cannot be injected`);
    }
    if (!state.veiled || phase.phase !== 'hand-over' || matchOver(state.scores, state.rules.targetScore)) {
      return err('injection-not-needed', 'this table deals for itself');
    }
    const order = payloadDeckOrder(payload);
    if (!order) return err('bad-injection', 'expected {deckOrder} of 52 entries');
    const freshFrom = DECK_SIZE * state.handNo;
    const handles = order.filter(isVeilHandle).map(veilHandleIndex);
    if (handles.length !== DECK_SIZE || handles.some((index) => index === null || index < freshFrom)) {
      return err('stale-handles', `ceremony handles must be fresh (index ≥ ${freshFrom})`);
    }
    if (order.some((id) => !isVeilHandle(id) && stateContainsCardId(state, id))) {
      return err('card-already-open', 'an opened card is already visible at the table');
    }
    return true;
  },
};

export interface SpadesDefOptions {
  bots?: readonly BotPolicy<SpadesState>[];
}

/**
 * The headless Spades engine: a full partnership match inside one deterministic
 * session. Scores/bags/dealer live on the game state so the table snapshot and
 * the match never diverge.
 */
export function createSpadesDef(options: SpadesDefOptions = {}): GameDef<SpadesState, SpadesRules> {
  const bots = options.bots ?? TIER_BOTS;
  return {
    id: GAME_ID,
    howToPlay: spadesHowToPlay,
    configSchema: spadesConfig,
    veil: veilSupport({
      deck: DECK,
      handSize: HAND_SIZE,
      publicSetup: 'none',
    }),

    setup(ctx) {
      if (!Number.isInteger(ctx.seats) || ctx.seats !== SPADES_SEATS) {
        throw new Error(`spades needs exactly ${SPADES_SEATS} seats`);
      }
      const order = dealOrder(ctx, DECK);
      return freshHand(emptyMatch(ctx.config, ctx.veiled === true), dealFreshHand(0, order, ctx.fx), null);
    },

    moves: {
      bid,
      bidNil,
      playCard,
      scoreHand: scoreHandMove,
      nextHand,
      'spades.hand.order': nextHand,
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

export const spadesGame = createSpadesDef();

/** playerView is a redacted SpadesState — same shape, opponent hands are `??`. */
export type SpadesPlayerView = SpadesState;

export function phaseForState(state: SpadesState): PhaseState {
  return phaseFor(state);
}

export { teamOf };
