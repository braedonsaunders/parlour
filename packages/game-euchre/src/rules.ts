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
import { followError } from '@parlour/tricks';
import { euchreConfig, type EuchreRules } from './config';
import {
  DECK_SIZE,
  EUCHRE_SUIT_NAMES,
  EUCHRE_SUITS,
  euchreDeck,
  effectiveSuit,
  euchreTrickRules,
  HAND_SIZE,
  KITTY_SIZE,
  suitLetterOf,
  teamOf,
  trickWinner,
  type EuchreSuit,
} from './deck';
import { euchreHowToPlay } from './howto';
import { scoreHand, tricksByTeam } from './score';
import { TIER_BOTS } from './bots';
import type { EuchreState, HandSummary } from './state';

const DECK = euchreDeck();
const DEAL_STAGGER_MS = 65;
/** flight of the final card into the trick before it sweeps toward the winner */
const COLLECT_DELAY_MS = 260;

function err(code: string, message: string): RuleError {
  return { code, message };
}

function payloadCard(payload: unknown): CardId | null {
  const card = (payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' && card.length > 0 ? card : null;
}

function payloadSuit(payload: unknown): EuchreSuit | null {
  const suit = (payload as { suit?: unknown } | undefined)?.suit;
  return typeof suit === 'string' && (EUCHRE_SUITS as readonly string[]).includes(suit)
    ? (suit as EuchreSuit)
    : null;
}

function payloadAlone(payload: unknown): boolean {
  return (payload as { alone?: unknown } | undefined)?.alone === true;
}

function payloadDeckOrder(payload: unknown): readonly CardId[] | null {
  const order = (payload as { deckOrder?: unknown } | undefined)?.deckOrder;
  if (!Array.isArray(order) || order.length !== DECK_SIZE) return null;
  return order.every((id) => typeof id === 'string' && id.length > 0) ? (order as CardId[]) : null;
}

function partnerOf(seat: SeatId): SeatId {
  return (seat + 2) % 4;
}

function nextSeat(from: SeatId, sittingOut: SeatId | null = null): SeatId {
  let seat = (from + 1) % 4;
  while (seat === sittingOut) seat = (seat + 1) % 4;
  return seat;
}

function hand(state: EuchreState, seat: SeatId): CardId[] {
  return state.hands[seat] ?? [];
}

/** Seats that take part in tricks this hand (three when a lone hand runs). */
function activeSeatCount(state: EuchreState): number {
  return state.sittingOut === null ? 4 : 3;
}

// ---------------------------------------------------------------------------
// dealing
// ---------------------------------------------------------------------------

interface FreshDeal {
  hands: CardId[][];
  kitty: CardId[];
  upcard: CardId;
  dealer: SeatId;
  turn: SeatId;
}

/**
 * Deals one hand from an ordered deck: five cards to each seat starting left
 * of the dealer, then the kitty — whose top card turns face up. `order` comes
 * from `dealOrder(ctx, …)` in setup, or from a veiled room's ceremony order.
 */
function dealFreshHand(dealer: SeatId, order: readonly CardId[], fx: MoveCtx['fx']): FreshDeal {
  const hands: CardId[][] = [[], [], [], []];
  let cursor = 0;
  for (let cardIndex = 0; cardIndex < HAND_SIZE; cardIndex++) {
    for (let step = 1; step <= 4; step++) {
      const seat = (dealer + step) % 4;
      const card = order[cursor++] as CardId;
      hands[seat]!.push(card);
      fx.emit(
        Fx.DealCard,
        { card, from: 'stock', to: `hand:${seat}`, dur: 220 },
        (cursor - 1) * DEAL_STAGGER_MS,
      );
    }
  }
  const upcard = order[cursor] as CardId;
  const kitty = order.slice(cursor, cursor + KITTY_SIZE);
  fx.emit(Fx.FlipCard, { card: upcard, from: 'stock', to: 'discard' }, cursor * DEAL_STAGGER_MS);
  return { hands, kitty, upcard, dealer, turn: nextSeat(dealer) };
}

function freshHand(base: EuchreState, dealt: FreshDeal): EuchreState {
  return {
    ...base,
    hands: dealt.hands,
    kitty: dealt.kitty,
    upcard: dealt.upcard,
    turnedDown: null,
    stage: 'bidding',
    biddingRound: 1,
    dealer: dealt.dealer,
    turn: dealt.turn,
    passesThisRound: 0,
    bids: [],
    trump: null,
    caller: null,
    alone: false,
    sittingOut: null,
    leader: null,
    trick: [],
    tricksPlayed: 0,
    trickWinners: [],
    summary: null,
  };
}

function emptyHand(config: EuchreRules, veiled: boolean): EuchreState {
  return {
    rules: config,
    veiled,
    scores: [0, 0],
    handNo: 1,
    dealer: 0,
    hands: [[], [], [], []],
    kitty: [],
    upcard: null,
    turnedDown: null,
    stage: 'bidding',
    biddingRound: 1,
    turn: 1,
    passesThisRound: 0,
    bids: [],
    trump: null,
    caller: null,
    alone: false,
    sittingOut: null,
    leader: null,
    trick: [],
    tricksPlayed: 0,
    trickWinners: [],
    summary: null,
  };
}

// ---------------------------------------------------------------------------
// player moves — bidding
// ---------------------------------------------------------------------------

function bidRecord(
  state: EuchreState,
  seat: SeatId,
  bid: 'order-up' | 'pass' | 'call',
  alone?: boolean,
) {
  return [...state.bids, { seat, bid, ...(alone ? { alone: true } : {}) }];
}

const orderUp: Move<EuchreState> = {
  validate(state, seat, payload) {
    if (state.stage !== 'bidding' || state.biddingRound !== 1) {
      return err('not-bidding-round-1', 'the upcard is not available');
    }
    if (state.turn !== seat) return err('not-your-turn', 'another seat is deciding');
    if (payloadAlone(payload) && !state.rules.goingAlone) {
      return err('alone-disabled', 'going alone is off at this table');
    }
    if (state.upcard === null) return err('no-upcard', 'the upcard is gone');
    return true;
  },
  apply(state, seat, payload, ctx) {
    const alone = state.rules.goingAlone && payloadAlone(payload);
    const upcard = state.upcard as CardId;
    const trump = suitLetterOf(upcard) as EuchreSuit;
    ctx.fx.emit('euchre.call', { seat, suit: trump, round: 1, alone });
    ctx.fx.emit('euchre.pickup', { dealer: state.dealer, picked: upcard }, 140);
    ctx.fx.emit(Fx.TurnRing, { seat: state.dealer }, 220);
    return {
      ...state,
      bids: bidRecord(state, seat, 'order-up', alone),
      stage: 'discarding',
      turn: state.dealer,
      trump,
      caller: seat,
      alone,
      sittingOut: alone ? partnerOf(seat) : null,
      hands: state.hands.map((cards, index) =>
        index === state.dealer ? [...cards, upcard] : cards.slice(),
      ),
      upcard: null,
    };
  },
};

const bidPass: Move<EuchreState> = {
  validate(state, seat) {
    if (state.stage !== 'bidding') return err('not-bidding', 'the bidding is over');
    if (state.turn !== seat) return err('not-your-turn', 'another seat is deciding');
    if (
      state.biddingRound === 2 &&
      state.rules.stickDealer &&
      state.passesThisRound === 3 &&
      seat === state.dealer
    ) {
      return err('stick-the-dealer', 'the dealer must call a suit');
    }
    return true;
  },
  apply(state, seat, _payload, ctx) {
    ctx.fx.emit('euchre.bid-pass', { seat });
    const passes = state.passesThisRound + 1;
    const bids = bidRecord(state, seat, 'pass');

    if (state.biddingRound === 1 && passes < 4) {
      return { ...state, bids, passesThisRound: passes, turn: nextSeat(seat) };
    }

    if (state.biddingRound === 1) {
      // everyone passed: the upcard is buried face down and round two begins
      const buried = state.upcard as CardId;
      ctx.fx.emit('euchre.turn-down', { card: buried });
      return {
        ...state,
        bids,
        biddingRound: 2,
        passesThisRound: 0,
        turn: nextSeat(state.dealer),
        upcard: null,
        turnedDown: buried,
      };
    }

    if (state.rules.stickDealer && seat === state.dealer && state.passesThisRound === 3) {
      // unreachable through the flow — bidPass.validate refuses this call
      throw new Error('bidPass: stick-the-dealer required a call');
    }
    if (passes < 4) {
      return { ...state, bids, passesThisRound: passes, turn: nextSeat(seat) };
    }

    // no trump named twice: throw the hand in and pass the deal left
    ctx.fx.emit('euchre.hand-score', { reason: 'thrown-in', points: 0 });
    ctx.fx.emit(Fx.ShuffleStock, {}, 120);
    const dealer = (state.dealer + 1) % 4;
    const dealt = dealFreshHand(dealer, ctx.rng.shuffle(DECK.cardIds), ctx.fx);
    return freshHand({ ...state, bids, handNo: state.handNo + 1 }, dealt);
  },
};

const callTrump: Move<EuchreState> = {
  validate(state, seat, payload) {
    if (state.stage !== 'bidding' || state.biddingRound !== 2) {
      return err('not-bidding-round-2', 'trump can only be named in the second round');
    }
    if (state.turn !== seat) return err('not-your-turn', 'another seat is deciding');
    const suit = payloadSuit(payload);
    if (suit === null) return err('bad-suit', 'expected {suit} to be S, H, D or C');
    if (payloadAlone(payload) && !state.rules.goingAlone) {
      return err('alone-disabled', 'going alone is off at this table');
    }
    if (state.turnedDown !== null && suitLetterOf(state.turnedDown) === suit) {
      return err('turned-down-suit', `${EUCHRE_SUIT_NAMES[suit]} were just turned down`);
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const suit = payloadSuit(payload) as EuchreSuit;
    const alone = state.rules.goingAlone && payloadAlone(payload);
    const lead = nextSeat(state.dealer);
    ctx.fx.emit('euchre.call', { seat, suit, round: 2, alone });
    ctx.fx.emit(Fx.TurnRing, { seat: lead }, 200);
    return {
      ...state,
      bids: bidRecord(state, seat, 'call', alone),
      stage: 'playing',
      turn: lead,
      leader: lead,
      trump: suit,
      caller: seat,
      alone,
      sittingOut: alone ? partnerOf(seat) : null,
      passesThisRound: 0,
    };
  },
};

// ---------------------------------------------------------------------------
// player moves — discarding and trick play
// ---------------------------------------------------------------------------

const dealerDiscard: Move<EuchreState> = {
  validate(state, seat, payload) {
    if (state.stage !== 'discarding') return err('not-discarding', 'nothing to bury yet');
    if (seat !== state.dealer || state.turn !== seat) {
      return err('not-dealer', 'only the dealer buries a card');
    }
    const card = payloadCard(payload);
    if (!card) return err('bad-payload', 'expected {card}');
    // no opening required: the buried card goes under the kitty face down
    if (!hand(state, seat).includes(card)) {
      return err('not-in-hand', `${card} is not in the dealer's hand`);
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const card = payloadCard(payload) as CardId;
    ctx.fx.emit('euchre.pickup', { dealer: seat, discarded: card });
    const lead = nextSeat(state.dealer);
    ctx.fx.emit(Fx.TurnRing, { seat: lead }, 180);
    return {
      ...state,
      hands: removeFromHand(state.hands, seat, card),
      kitty: [card, ...state.kitty],
      stage: 'playing',
      turn: lead,
      leader: lead,
    };
  },
};

/** The suit led in the current trick, using bowers-correct effective suits. */
function currentLedSuit(state: EuchreState): EuchreSuit | null {
  const first = state.trick[0]?.card;
  if (first === undefined || state.trump === null) return null;
  return effectiveSuit(first, state.trump);
}

/**
 * A follow violation exists only where the table can read hands. Under Veil
 * legality stays public-only: following becomes an audited-friends honour
 * claim verified by the room's match-end audit, never by hidden state.
 */
function followViolation(state: EuchreState, seat: SeatId, card: CardId): RuleError | null {
  const led = currentLedSuit(state);
  const trump = state.trump;
  if (!led || !trump) return null;
  const violation = followError(
    { ledSuit: led, hand: hand(state, seat), card },
    euchreTrickRules(trump),
  );
  return violation
    ? err('must-follow-suit', `you hold ${EUCHRE_SUIT_NAMES[led]} — you must follow`)
    : null;
}

const playCard: Move<EuchreState> = {
  validate(state, seat, payload) {
    if (state.stage !== 'playing') return err('not-playing', 'no trick in progress');
    if (state.turn !== seat || state.leader === null) {
      return err('not-your-turn', 'it is not this seat’s play');
    }
    const card = payloadCard(payload);
    if (!card) return err('bad-payload', 'expected {card}');
    if (isVeilHandle(card)) {
      return err('card-still-veiled', 'the played card has not been opened yet');
    }
    if (!hand(state, seat).includes(card)) return err('not-in-hand', `${card} is not in the hand`);
    if (state.trump === null) return err('no-trump', 'trump has not been named');
    const violation = followViolation(state, seat, card);
    if (violation && !state.veiled) return violation;
    return true;
  },
  apply(state, seat, payload, ctx) {
    const card = payloadCard(payload) as CardId;
    const trump = state.trump as EuchreSuit;
    const trick = [...state.trick, { seat, card }];
    ctx.fx.emit('euchre.trick-play', { seat, card });

    if (trick.length < activeSeatCount(state)) {
      return {
        ...state,
        trick,
        hands: removeFromHand(state.hands, seat, card),
        turn: nextSeat(seat, state.sittingOut),
      };
    }

    const winner = trickWinner(trick, trump);
    ctx.fx.emit(
      'euchre.trick-collect',
      { winner, team: teamOf(winner), cards: trick.map((play) => play.card) },
      COLLECT_DELAY_MS,
    );
    const tricksPlayed = state.tricksPlayed + 1;
    ctx.fx.emit(Fx.TurnRing, { seat: winner }, COLLECT_DELAY_MS + 60);
    return {
      ...state,
      trick: [],
      hands: removeFromHand(state.hands, seat, card),
      tricksPlayed,
      trickWinners: [...state.trickWinners, winner],
      leader: winner,
      turn: winner,
    };
  },
};

function removeFromHand(hands: CardId[][], seat: SeatId, card: CardId): CardId[][] {
  return hands.map((cards, index) => (index === seat ? cards.filter((c) => c !== card) : cards));
}

// ---------------------------------------------------------------------------
// system moves — scoring and the next deal
// ---------------------------------------------------------------------------

const scoreHandMove: Move<EuchreState> = {
  validate: () => true,
  apply(state, _seat, _payload, ctx) {
    const caller = state.caller as SeatId;
    const [makerTricks, defenderTricks] = tricksByTeam(state);
    const verdict = scoreHand({ makerTricks, alone: state.alone });
    const makerTeam = teamOf(caller);
    const defenderTeam = makerTeam === 0 ? 1 : 0;
    const summary: HandSummary = {
      handNo: state.handNo,
      dealer: state.dealer,
      makerTeam,
      caller,
      alone: state.alone,
      trump: state.trump as EuchreSuit,
      makerTricks,
      defenderTricks,
      makerPoints: verdict.makerPoints,
      defenderPoints: verdict.defenderPoints,
      reason: verdict.reason,
    };
    const scores: [number, number] = [state.scores[0], state.scores[1]];
    scores[makerTeam] += summary.makerPoints;
    scores[defenderTeam] += summary.defenderPoints;

    ctx.fx.emit('euchre.hand-score', {
      reason: summary.reason,
      handNo: summary.handNo,
      makerTeam,
      caller,
      alone: summary.alone,
      makerTricks,
      defenderTricks,
      points: Math.max(summary.makerPoints, summary.defenderPoints),
    });
    if (summary.makerPoints > 0) {
      ctx.fx.emit('euchre.score-chip', { team: makerTeam, total: scores[makerTeam] }, 120);
    }
    if (summary.defenderPoints > 0) {
      ctx.fx.emit('euchre.score-chip', { team: defenderTeam, total: scores[defenderTeam] }, 120);
    }
    if (scores[0] >= state.rules.targetScore || scores[1] >= state.rules.targetScore) {
      ctx.fx.emit(Fx.RoundEnd, { reason: 'match-over' }, 240);
    }
    return { ...state, summary, scores, stage: 'hand-over' };
  },
};

/**
 * Starts the next hand. Open rooms arrive through flow.advance autoMoves and
 * shuffle with the event-seeded rng. Veiled rooms cannot: a deterministic
 * reshuffle would print every future face into the shared log. They park at
 * `hand-over` until the room injects `euchre.hand.order` — the ceremony's
 * opaque deck order with the new upcard opened in public.
 */
const nextHand: Move<EuchreState> = {
  validate: () => true,
  apply(state, _seat, payload, ctx) {
    const dealer = (state.dealer + 1) % 4;
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
    return freshHand({ ...state, handNo: state.handNo + 1 }, dealt);
  },
};

// ---------------------------------------------------------------------------
// flow
// ---------------------------------------------------------------------------

function matchNotOver(state: EuchreState): boolean {
  const target = state.rules.targetScore;
  return state.scores[0] < target && state.scores[1] < target;
}

function phaseFor(state: EuchreState): PhaseState {
  switch (state.stage) {
    case 'bidding':
      return { phase: 'bidding', actor: state.turn, round: state.handNo };
    case 'discarding':
      return {
        phase: 'discarding',
        actor: state.dealer,
        round: state.handNo,
        label: 'dealer buries a card',
      };
    case 'playing':
      return { phase: 'playing', actor: state.turn, round: state.handNo };
    case 'hand-over':
      return state.veiled && matchNotOver(state)
        ? { phase: 'hand-over', actor: null, round: state.handNo, label: 'awaiting the next deal' }
        : { phase: 'over', actor: null, round: state.handNo };
  }
}

function matchEndResult(state: EuchreState) {
  if (state.summary === null || matchNotOver(state)) return null;
  const winningTeam: 0 | 1 = state.scores[0] >= state.rules.targetScore ? 0 : 1;
  const losingTeam = winningTeam === 0 ? 1 : 0;
  const seatsOf = (team: 0 | 1): SeatId[] => [team, team + 2];
  return {
    winner: seatsOf(winningTeam)[0]!,
    rankings: [
      ...seatsOf(winningTeam).map((seat) => ({
        seat,
        rank: 1,
        detail: { team: winningTeam, score: state.scores[winningTeam] },
      })),
      ...seatsOf(losingTeam).map((seat) => ({
        seat,
        rank: 2,
        detail: { team: losingTeam, score: state.scores[losingTeam] },
      })),
    ],
    reason: `first to ${state.rules.targetScore}`,
  };
}

function legalBiddingMoves(state: EuchreState, seat: SeatId): LegalMove[] | null {
  if (state.stage !== 'bidding' || state.turn !== seat) return null;
  const aloneVariants: readonly boolean[] = state.rules.goingAlone ? [false, true] : [false];

  if (state.biddingRound === 1) {
    return [
      ...aloneVariants.map((alone) => ({ id: 'orderUp', payload: { alone } }) as LegalMove),
      { id: 'bidPass' },
    ];
  }

  const suits = EUCHRE_SUITS.filter(
    (suit) => state.turnedDown === null || suitLetterOf(state.turnedDown) !== suit,
  );
  const calls = suits.flatMap((suit) =>
    aloneVariants.map((alone) => ({ id: 'callTrump', payload: { suit, alone } })),
  );
  const forced = state.rules.stickDealer && state.passesThisRound === 3 && seat === state.dealer;
  return forced ? calls : [...calls, { id: 'bidPass' }];
}

function legalMovesForSeat(state: EuchreState, seat: SeatId): LegalMove[] {
  if (state.summary && matchEndResult(state)) return [];

  const bidding = legalBiddingMoves(state, seat);
  if (bidding) return bidding;

  if (state.stage === 'discarding' && seat === state.dealer) {
    return hand(state, seat).map((card) => ({ id: 'dealerDiscard', payload: { card } }));
  }

  if (state.stage === 'playing' && state.turn === seat && state.trump !== null) {
    return hand(state, seat)
      .filter((card) => state.veiled || followViolation(state, seat, card) === null)
      .map((card) => ({ id: 'playCard', payload: { card } }));
  }

  return [];
}

const flow: GameDef<EuchreState, EuchreRules>['flow'] = {
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
    if (ended) return { phase: phaseFor(state), ended };

    if (state.stage === 'hand-over') {
      if (state.veiled) return { phase: phaseFor(state) };
      return {
        phase: phaseFor(state),
        autoMoves: [{ seat: null, move: 'nextHand', reason: 'next deal' }],
      };
    }

    if (event.move === 'playCard' && state.tricksPlayed === HAND_SIZE && state.summary === null) {
      return {
        phase: phaseFor(state),
        autoMoves: [{ seat: null, move: 'scoreHand', reason: 'five tricks played' }],
      };
    }

    return { phase: phaseFor(state) };
  },

  /**
   * Veiled rooms receive each new deal through an injected ceremony order —
   * the sanctioned path for outside facts (apps/web/src/lib/multiplayer/veil).
   */
  canInject(state, phase, moveId, payload) {
    if (moveId !== 'euchre.hand.order') {
      return err('bad-injection', `${moveId} cannot be injected`);
    }
    if (!state.veiled || phase.phase !== 'hand-over' || !matchNotOver(state)) {
      return err('injection-not-needed', 'this table deals for itself');
    }
    const order = payloadDeckOrder(payload);
    if (!order) return err('bad-injection', 'expected {deckOrder} of 24 entries');

    const freshFrom = DECK_SIZE * state.handNo;
    const handles = order.filter(isVeilHandle).map(veilHandleIndex);
    if (
      handles.length !== DECK_SIZE - 1 ||
      handles.some((index) => index === null || index < freshFrom)
    ) {
      return err('stale-handles', `ceremony handles must be fresh (index ≥ ${freshFrom})`);
    }
    const opened = order.filter((id) => !isVeilHandle(id));
    if (opened.length !== 1 || !DECK.cardIds.includes(opened[0]!)) {
      return err('bad-injection', 'exactly one public opening (the upcard) is expected');
    }
    if (stateContainsCardId(state, opened[0]!)) {
      return err('card-already-open', 'the opened upcard is already visible at the table');
    }
    return true;
  },
};

// ---------------------------------------------------------------------------
// definition
// ---------------------------------------------------------------------------

export interface EuchreDefOptions {
  bots?: readonly BotPolicy<EuchreState>[];
}

/**
 * The headless euchre engine: a full match — deal, bidding, five tricks and
 * scoring — inside one deterministic session, so friend rooms play complete
 * games over the shared single-session P2P stack. Follow-suit enforcement
 * degrades to an audited-friends honour claim under Veil.
 */
export function createEuchreDef(options: EuchreDefOptions = {}): GameDef<EuchreState, EuchreRules> {
  const bots = options.bots ?? TIER_BOTS;
  return {
    id: 'euchre',
    howToPlay: euchreHowToPlay,
    configSchema: euchreConfig,
    // Veil, inherited: five cards a seat, then one kitty card the room opens
    // in public — exactly the turned-up card the first bidder reads.
    veil: veilSupport({
      deck: euchreDeck(),
      handSize: HAND_SIZE,
      publicSetup: 'one',
    }),

    setup(ctx) {
      if (!Number.isInteger(ctx.seats) || ctx.seats !== 4) {
        throw new Error('euchre requires exactly 4 seats');
      }
      const order = dealOrder(ctx, DECK);
      return freshHand(emptyHand(ctx.config, ctx.veiled === true), dealFreshHand(0, order, ctx.fx));
    },

    moves: {
      orderUp,
      bidPass,
      callTrump,
      dealerDiscard,
      playCard,
      scoreHand: scoreHandMove,
      nextHand,
      // the ceremony-facing alias for the injected next deal
      'euchre.hand.order': nextHand,
    },

    flow,

    playerView(state, seat) {
      return {
        ...state,
        hands: state.hands.map((cards, index) =>
          index === seat ? cards.slice() : cards.map(() => '??'),
        ),
        kitty: state.kitty.map(() => '??'),
      };
    },

    end(state) {
      return matchEndResult(state);
    },

    bots,
  };
}
