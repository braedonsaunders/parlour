import {
  advanceSeat,
  Fx,
  stdDeck,
  veilSupport,
  dealOrder,
  type AppliedEvent,
  type CardId,
  type Flow,
  type FlowAdvance,
  type GameDef,
  type LegalMove,
  type MoveCtx,
  type PhaseState,
  type RuleError,
  type SeatId,
  type SetupCtx,
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
import { auditFollowSuit } from './audit';
import { QUEEN_SPADES, TWO_CLUBS, heartsTrickRules, isHeart, isPenaltyCard } from './cards';
import { heartsConfigSchema, passOffset, type HeartsRules } from './config';
import { HEARTS_BOTS } from './bots';
import { heartsHowToPlay } from './howto';
import { adjustedHandPoints, handResult } from './scoring';
import { HEARTS_SEATS, TRICKS_PER_HAND, type HeartsState } from './state';

export const GAME_ID = 'hearts';
export const PASS_SIZE = 3;

const DEAL_STAGGER_MS = 70;
const VEIL_HANDLE_PREFIX = 'v#';

type PlayClaim = 'all-hearts' | 'all-penalty';

interface PassPayload {
  cards: CardId[];
}

interface PlayPayload {
  card: CardId;
  claim?: PlayClaim;
}

function err(code: string, message: string): RuleError {
  return { code, message };
}

function handOf(state: HeartsState, seat: SeatId): CardId[] {
  return state.hands[seat] ?? [];
}

export function isRealCard(card: string): boolean {
  return !card.startsWith(VEIL_HANDLE_PREFIX);
}

function payloadPass(payload: unknown): PassPayload | null {
  const cards = (payload as { cards?: unknown } | undefined)?.cards;
  if (
    !Array.isArray(cards) ||
    cards.length !== PASS_SIZE ||
    !cards.every((card) => typeof card === 'string')
  ) {
    return null;
  }
  if (new Set(cards).size !== PASS_SIZE) return null;
  return { cards: cards as CardId[] };
}

function payloadPlay(payload: unknown): PlayPayload | null {
  const record = (payload ?? {}) as { card?: unknown; claim?: unknown };
  if (typeof record.card !== 'string') return null;
  if (
    record.claim !== undefined &&
    record.claim !== 'all-hearts' &&
    record.claim !== 'all-penalty'
  ) {
    return null;
  }
  return { card: record.card, claim: record.claim as PlayClaim | undefined };
}

function allHearts(cards: readonly CardId[]): boolean {
  return cards.length > 0 && cards.every(isHeart);
}

function allPenalty(cards: readonly CardId[]): boolean {
  return cards.length > 0 && cards.every((card) => isPenaltyCard(card, false));
}

function firstTrick(state: HeartsState): boolean {
  return state.tricksPlayed === 0;
}

/**
 * Claim verification for the two exceptions that read hidden state. Runs
 * against the OPENED board: a valid claim leaves zero handles behind and every
 * remaining card satisfies the claimed predicate, so a bluff rejects before it
 * ever enters the log.
 */
function claimVerified(state: HeartsState, seat: SeatId, claim: PlayClaim): boolean {
  const hand = handOf(state, seat);
  if (!hand.every(isRealCard)) return false;
  return claim === 'all-hearts' ? allHearts(hand) : allPenalty(hand);
}

/** Open-table truth for enumeration and UI legality. */
function canPlayCard(state: HeartsState, seat: SeatId, card: CardId): boolean {
  const hand = handOf(state, seat);
  const ledSuit = state.trick?.ledSuit ?? null;

  if (!state.ledTwoClubs) return card === TWO_CLUBS;
  if (ledSuit === null) {
    if (firstTrick(state)) return card === TWO_CLUBS;
    if (isHeart(card) && !state.heartsBroken && !allHearts(hand)) return false;
    return true;
  }
  if (followError({ ledSuit, hand, card }, heartsTrickRules()) !== null) return false;
  if (firstTrick(state) && state.rules.noPointsFirstTrick && isPenaltyCard(card, false)) {
    return allPenalty(hand);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

const passCards = {
  validate(state: HeartsState, seat: SeatId, payload: unknown): true | RuleError {
    if (!state.passing) return err('no-pass-now', 'there is nothing to pass');
    const picked = payloadPass(payload);
    if (!picked) return err('bad-pass', 'expected {cards} — exactly three different cards');
    const hand = handOf(state, seat);
    for (const card of picked.cards) {
      if (!hand.includes(card)) return err('not-in-hand', `${card} is not in your hand`);
    }
    return true;
  },
  apply(state: HeartsState, seat: SeatId, payload: unknown, ctx: MoveCtx): HeartsState {
    const picked = payloadPass(payload);
    if (!picked) throw new Error('passCards apply requires {cards}');
    const seats = state.seats;
    const selections = state.selections.map((pick, index) =>
      index === seat ? picked.cards : pick,
    );
    const hands = state.hands.map((cards, index) =>
      index === seat ? cards.filter((card) => !picked.cards.includes(card)) : cards.slice(),
    );
    ctx.fx.emit('hearts.pass.pick', { seat });

    if (selections.some((pick) => pick === null)) {
      return { ...state, selections, hands };
    }

    // Last selection landed — every wall drops at once.
    const offset = passOffset(state.rules.passDirection);
    const received = Array.from({ length: seats }, () => [] as CardId[]);
    const transfers: { from: SeatId; to: SeatId; cards: CardId[] }[] = [];
    for (let giver = 0; giver < seats; giver++) {
      const receiver = advanceSeat(giver, seats, offset);
      const cards = selections[giver] ?? [];
      received[receiver] = [...cards];
      transfers.push({ from: giver, to: receiver, cards: [...cards] });
    }
    const mergedHands = hands.map((cards, index) => [...cards, ...(received[index] ?? [])]);
    const holder = Math.max(
      0,
      mergedHands.findIndex((cards) => cards.includes(TWO_CLUBS)),
    );
    ctx.fx.emit('hearts.pass.reveal', { direction: state.rules.passDirection, transfers });
    ctx.fx.emit(Fx.TurnRing, { seat: holder }, 640);
    return {
      ...state,
      hands: mergedHands,
      selections: Array.from({ length: seats }, () => null),
      passing: false,
      leader: holder,
      turn: holder,
    };
  },
};

const playCard = {
  validate(state: HeartsState, seat: SeatId, payload: unknown): true | RuleError {
    if (state.passing) return err('still-passing', 'the pass has not landed yet');
    // Veil lead window: every seat stays eligible until someone's opened 2♣
    // lands, so turn-gating is suspended until the hand has been led.
    const veilLeadWindow = !state.ledTwoClubs && state.tricksPlayed === 0 && !state.trick;
    if (!veilLeadWindow && state.turn !== seat) {
      return err('not-your-turn', 'it is not your turn');
    }
    const play = payloadPlay(payload);
    if (!play) return err('bad-play', 'expected {card}');
    if (!handOf(state, seat).includes(play.card)) {
      return err('not-in-hand', `${play.card} is not in your hand`);
    }

    const ledSuit = state.trick?.ledSuit ?? null;

    // Trick one opens with the two of clubs — enforced on the OPENED card, so
    // it holds under Veil too: a wrong lead rejects without entering the log.
    if (firstTrick(state) && ledSuit === null && play.card !== TWO_CLUBS) {
      return err('lead-two-clubs', 'the two of clubs leads the first trick');
    }
    if (ledSuit === null && !firstTrick(state) && isHeart(play.card) && !state.heartsBroken) {
      if (!state.veiled) {
        if (!allHearts(handOf(state, seat))) {
          return err('hearts-not-broken', 'hearts have not been broken yet');
        }
      } else if (play.claim !== 'all-hearts' || !claimVerified(state, seat, 'all-hearts')) {
        return err(
          'bad-claim',
          'leading an unbroken heart under Veil needs an opened all-hearts claim',
        );
      }
    }
    if (ledSuit !== null && !state.veiled) {
      const fault = followError(
        { ledSuit, hand: handOf(state, seat), card: play.card },
        heartsTrickRules(),
      );
      if (fault) return err(fault, 'you must follow suit');
    }
    if (
      ledSuit !== null &&
      firstTrick(state) &&
      state.rules.noPointsFirstTrick &&
      isPenaltyCard(play.card, false)
    ) {
      if (!state.veiled) {
        if (!allPenalty(handOf(state, seat))) {
          return err('no-points-first-trick', 'no penalty cards on the first trick');
        }
      } else if (play.claim !== 'all-penalty' || !claimVerified(state, seat, 'all-penalty')) {
        return err(
          'bad-claim',
          'throwing a penalty card on trick one under Veil needs an opened all-penalty claim',
        );
      }
    }
    return true;
  },
  apply(state: HeartsState, seat: SeatId, payload: unknown, ctx: MoveCtx): HeartsState {
    const play = payloadPlay(payload);
    if (!play) throw new Error('playCard apply requires {card}');

    const wasLeading = state.trick === null;
    const hand = handOf(state, seat).filter((card) => card !== play.card);
    const hands = state.hands.map((cards, index) => (index === seat ? hand : cards.slice()));
    const trick = playToTrick(state.trick ?? openTrick(seat), seat, play.card, heartsTrickRules());
    const plays = [...state.plays, { seat, card: play.card }];
    emitTrickPlay(ctx.fx, seat, play.card, trick.plays.length - 1);

    let heartsBroken = state.heartsBroken;
    if (isHeart(play.card) && !heartsBroken) {
      heartsBroken = true;
      ctx.fx.emit('hearts.broken', { seat });
    }

    const base: HeartsState = {
      ...state,
      hands,
      trick,
      plays,
      heartsBroken,
      ledTwoClubs: state.ledTwoClubs || (wasLeading && play.card === TWO_CLUBS),
      leader: wasLeading ? seat : state.leader,
    };

    if (!isTrickComplete(trick, state.seats)) {
      return { ...base, turn: advanceSeat(seat, state.seats) };
    }

    // Fourth card — sweep the trick to its taker.
    const cards = trickCards(trick);
    const winner = resolveTrickWinner(trick, heartsTrickRules()) ?? seat;
    emitTrickCollect(ctx.fx, winner, cards);
    if (cards.includes(QUEEN_SPADES)) ctx.fx.emit('hearts.queen', { seat: winner });
    const heartCount = cards.filter(isHeart).length;
    if (heartCount > 0) ctx.fx.emit('hearts.point', { seat: winner, hearts: heartCount });

    const taken = state.taken.map((pile, index) =>
      index === winner ? [...pile, ...cards] : pile.slice(),
    );
    const tricksWon = state.tricksWon.map((count, index) => (index === winner ? count + 1 : count));
    const tricksPlayed = state.tricksPlayed + 1;
    const swept: HeartsState = {
      ...base,
      taken,
      tricksWon,
      tricksPlayed,
      trick: null,
      leader: winner,
      turn: winner,
    };

    if (tricksPlayed >= TRICKS_PER_HAND) {
      const { points, shooter } = adjustedHandPoints(taken, state.rules);
      if (shooter !== null) ctx.fx.emit('hearts.moon', { seat: shooter });
      ctx.fx.emit('hearts.hand.end', { points, shooter });
      return { ...swept, handOver: true, handPoints: points, moonShooter: shooter };
    }

    ctx.fx.emit(Fx.TurnRing, { seat: winner }, 140);
    return swept;
  },
};

const showdownOpen = {
  validate(state: HeartsState, seat: SeatId): true | RuleError {
    if (!state.handOver) return err('hand-playing', 'the hand is not over yet');
    if (!state.veiled) return err('not-veiled', 'this table plays in the open');
    if (state.openedUp[seat]) return err('already-open', 'your hand is already face up');
    return true;
  },
  apply(state: HeartsState, seat: SeatId, _payload: unknown, ctx: MoveCtx): HeartsState {
    ctx.fx.emit(Fx.ShowdownReveal, { seat, cards: handOf(state, seat).length });
    const openedUp = state.openedUp.map((opened, index) => (index === seat ? true : opened));
    if (openedUp.some((opened) => !opened)) return { ...state, openedUp };
    const disputed = auditFollowSuit(state.hands, state.plays, state.seats, heartsTrickRules());
    return { ...state, openedUp, disputed };
  },
};

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

function seatsAwaitingPass(state: HeartsState): SeatId[] {
  return state.selections.flatMap((pick, seat) => (pick === null ? [seat as SeatId] : []));
}

function seatsAwaitingOpen(state: HeartsState): SeatId[] {
  return state.openedUp.flatMap((opened, seat) => (!opened ? [seat as SeatId] : []));
}

function allSeatIds(count: number): SeatId[] {
  return Array.from({ length: count }, (_, seat) => seat as SeatId);
}

export function phaseFor(state: HeartsState): PhaseState {
  const round = state.tricksPlayed + 1;
  if (state.handOver) {
    if (state.veiled) {
      const pending = seatsAwaitingOpen(state);
      if (pending.length > 0) {
        return { phase: 'showdown-reveal', actor: pending[0] ?? null, actors: pending, round };
      }
    }
    return { phase: 'hand-over', actor: null, round };
  }
  if (state.passing) {
    const pending = seatsAwaitingPass(state);
    return { phase: 'pass', actor: pending[0] ?? null, actors: allSeatIds(state.seats), round };
  }
  if (!state.ledTwoClubs) {
    return { phase: 'lead', actor: null, actors: allSeatIds(state.seats), round };
  }
  return { phase: 'play', actor: state.turn, round };
}

const flow: Flow<HeartsState> = {
  start(state) {
    return phaseFor(state);
  },
  legalMoves() {
    return [];
  },
  legalMovesFor(state, phase, seat): readonly LegalMove[] {
    switch (phase.phase) {
      case 'pass': {
        if (state.selections[seat] !== null) return [];
        // One honest example of a legal pick — any three distinct hand cards
        // pass validation, and drivers need a concrete payload.
        const hand = [...handOf(state, seat)].sort().slice(0, PASS_SIZE);
        return [{ id: 'passCards', payload: { cards: hand } as unknown }];
      }
      case 'lead': {
        if (state.veiled) return [{ id: 'playCard', hint: 'the two of clubs leads' }];
        return handOf(state, seat)
          .filter((card) => card === TWO_CLUBS)
          .map((card) => ({ id: 'playCard', payload: { card } as unknown }));
      }
      case 'play': {
        if (state.turn !== seat) return [];
        if (state.veiled) return [{ id: 'playCard' }];
        return handOf(state, seat)
          .filter((card) => canPlayCard(state, seat, card))
          .map((card) => ({ id: 'playCard', payload: { card } as unknown }));
      }
      case 'showdown-reveal':
        return state.openedUp[seat] ? [] : [{ id: 'showdown.open' }];
      default:
        return [];
    }
  },
  advance(state, _event: AppliedEvent, _seats: number): FlowAdvance {
    const ended = endOfHand(state);
    return ended ? { phase: phaseFor(state), ended } : { phase: phaseFor(state) };
  },
};

function endOfHand(state: HeartsState) {
  if (!state.handOver) return null;
  if (state.veiled && state.openedUp.some((opened) => !opened)) return null;
  const points = state.handPoints ?? adjustedHandPoints(state.taken, state.rules).points;
  return handResult(points, state.taken, state.disputed);
}

// ---------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------

export const heartsGame: GameDef<HeartsState, HeartsRules> = {
  id: GAME_ID,
  configSchema: heartsConfigSchema,
  howToPlay: heartsHowToPlay,
  veil: veilSupport({
    deck: stdDeck(),
    handSize: 13,
    publicSetup: 'none',
  }),
  setup(ctx: SetupCtx<HeartsRules>) {
    if (ctx.seats !== HEARTS_SEATS) {
      throw new Error(`hearts needs exactly ${HEARTS_SEATS} seats`);
    }
    const order = dealOrder(ctx, stdDeck());
    const hands: CardId[][] = Array.from({ length: ctx.seats }, () => []);
    let cursor = 0;
    for (let row = 0; row < TRICKS_PER_HAND; row++) {
      for (let seat = 0; seat < ctx.seats; seat++) {
        const card = order[cursor++];
        if (!card) throw new Error('hearts deck exhausted during deal');
        hands[seat]?.push(card);
        ctx.fx.emit(
          Fx.DealCard,
          { card, from: 'stock', to: `hand:${seat}`, dur: 220 },
          (cursor - 1) * DEAL_STAGGER_MS,
        );
      }
    }

    const passing = ctx.config.passDirection !== 'hold';
    // Open tables know who holds the two of clubs; Veil tables find out when
    // someone's opened two lands on the table.
    const holder = ctx.veiled
      ? 0
      : Math.max(
          0,
          hands.findIndex((cards) => cards.includes(TWO_CLUBS)),
        );

    return {
      seats: ctx.seats,
      rules: ctx.config,
      veiled: ctx.veiled === true,
      hands,
      selections: Array.from({ length: ctx.seats }, () => null),
      passing,
      trick: null,
      leader: holder,
      turn: holder,
      taken: Array.from({ length: ctx.seats }, () => []),
      tricksWon: Array.from({ length: ctx.seats }, () => 0),
      plays: [],
      heartsBroken: false,
      tricksPlayed: 0,
      ledTwoClubs: !ctx.veiled,
      handOver: false,
      handPoints: null,
      moonShooter: null,
      openedUp: Array.from({ length: ctx.seats }, () => false),
      disputed: [],
    } satisfies HeartsState;
  },
  moves: {
    passCards,
    playCard,
    'showdown.open': showdownOpen,
  },
  flow,
  playerView(state, seat) {
    return {
      ...state,
      hands: state.hands.map((cards, index) =>
        index === seat ? cards.slice() : cards.map(() => '??'),
      ),
      selections: state.selections.map((pick, index) => {
        if (index === seat) return pick;
        return pick === null ? null : (['??', '??', '??'] as unknown as readonly CardId[]);
      }),
    };
  },
  end: endOfHand,
  bots: HEARTS_BOTS,
};
