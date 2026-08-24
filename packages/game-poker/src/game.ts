import {
  Fx,
  type BotPolicy,
  type CardId,
  type FlowAdvance,
  type GameDef,
  type LegalMove,
  type MatchResult,
  type Move,
  type MoveCtx,
  type PhaseState,
  type RuleError,
  type SeatId,
} from '@parlour/engine';
import {
  actorFrom,
  allInTo,
  bettingClosed,
  bettingPossible,
  bigBlindSeat,
  canRaise,
  firstToActPostflop,
  firstToActPreflop,
  minRaiseTo,
  nextActor,
  nextLiving,
  raiseLadder,
  smallBlindSeat,
} from './betting';
import { BOARD_CARDS, HOLE_CARDS, MAX_SEATS, MIN_SEATS, fullDeck } from './cards';
import {
  anteForLevel,
  blindsForLevel,
  handsPerLevel,
  pokerConfig,
  type PokerRules,
} from './config';
import { rankHand, type HandRank } from './evaluate';
import { awardPots, awardUncontested, buildPots, potTotal } from './pot';
import {
  actingSeats,
  contestingSeats,
  livingSeats,
  potSoFar,
  toCall,
  type ActionRecord,
  type HandSummary,
  type PokerState,
  type ShownHand,
  type Street,
} from './state';
import { pokerHowToPlay } from './howto';
import { TIER_BOTS } from './bots';

export const GAME_ID = 'poker';

const DEAL_STAGGER_MS = 70;
const BOARD_STAGGER_MS = 110;
const COLLECT_DELAY_MS = 240;
const AWARD_DELAY_MS = 420;

export const PokerFx = {
  Blind: 'poker.blind',
  Ante: 'poker.ante',
  Action: 'poker.action',
  Street: 'poker.street',
  PotCollect: 'poker.pot-collect',
  Showdown: 'poker.showdown',
  Award: 'poker.award',
  Muck: 'poker.muck',
  Bust: 'poker.bust',
  Button: 'poker.button',
  BlindsUp: 'poker.blinds-up',
} as const;

function err(code: string, message: string): RuleError {
  return { code, message };
}

function payloadAmount(payload: unknown): number | null {
  const to = (payload as { to?: unknown } | undefined)?.to;
  return typeof to === 'number' && Number.isInteger(to) ? to : null;
}

// ---------------------------------------------------------------------------
// Drafts
//
// A betting round touches eight parallel arrays at once. Copying them up front
// and mutating the copies keeps the reducer readable without ever writing
// through to the state the caller handed in.
// ---------------------------------------------------------------------------

interface PokerDraft {
  rules: PokerRules;
  seats: number;
  handNo: number;
  level: number;
  handsThisLevel: number;
  button: SeatId;
  stacks: number[];
  out: boolean[];
  bustOrder: SeatId[];
  hole: CardId[][];
  board: CardId[];
  deck: CardId[];
  street: Street;
  folded: boolean[];
  allIn: boolean[];
  committed: number[];
  streetBet: number[];
  currentBet: number;
  lastRaiseSize: number;
  needsToAct: boolean[];
  mayRaise: boolean[];
  turn: SeatId | null;
  aggressor: SeatId | null;
  shown: boolean[];
  actions: ActionRecord[];
  summary: HandSummary | null;
  lastHand: HandSummary | null;
}

function toDraft(state: PokerState): PokerDraft {
  return {
    rules: state.rules,
    seats: state.seats,
    handNo: state.handNo,
    level: state.level,
    handsThisLevel: state.handsThisLevel,
    button: state.button,
    stacks: [...state.stacks],
    out: [...state.out],
    bustOrder: [...state.bustOrder],
    hole: state.hole.map((cards) => [...cards]),
    board: [...state.board],
    deck: [...state.deck],
    street: state.street,
    folded: [...state.folded],
    allIn: [...state.allIn],
    committed: [...state.committed],
    streetBet: [...state.streetBet],
    currentBet: state.currentBet,
    lastRaiseSize: state.lastRaiseSize,
    needsToAct: [...state.needsToAct],
    mayRaise: [...state.mayRaise],
    turn: state.turn,
    aggressor: state.aggressor,
    shown: [...state.shown],
    actions: [...state.actions],
    summary: state.summary,
    lastHand: state.lastHand,
  };
}

const fromDraft = (draft: PokerDraft): PokerState => draft as PokerState;

/** A draft read back through the state helpers, which only need the readable shape. */
const asState = (draft: PokerDraft): PokerState => draft as PokerState;

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

/**
 * Moves chips from a stack into the pot.
 *
 * `street` chips also sit in front of the seat as its bet for the round; an
 * ante does not, because nobody is calling an ante. Both count towards the side
 * pots, which is the distinction the pot builder actually cares about.
 */
function commitChips(
  draft: PokerDraft,
  seat: SeatId,
  amount: number,
  options: { asBet: boolean },
): number {
  const paid = Math.max(0, Math.min(amount, draft.stacks[seat] as number));
  draft.stacks[seat] = (draft.stacks[seat] as number) - paid;
  draft.committed[seat] = (draft.committed[seat] as number) + paid;
  if (options.asBet) {
    draft.streetBet[seat] = (draft.streetBet[seat] as number) + paid;
  }
  if (draft.stacks[seat] === 0) draft.allIn[seat] = true;
  return paid;
}

function record(
  draft: PokerDraft,
  seat: SeatId,
  kind: ActionRecord['kind'],
  amount: number,
  ctx: MoveCtx,
): void {
  const entry: ActionRecord = {
    seat,
    kind,
    amount,
    to: draft.streetBet[seat] as number,
    street: draft.street,
    allIn: draft.allIn[seat] === true,
  };
  draft.actions.push(entry);
  ctx.fx.emit(kind === 'blind' ? PokerFx.Blind : kind === 'ante' ? PokerFx.Ante : PokerFx.Action, {
    seat,
    kind,
    amount,
    to: entry.to,
    allIn: entry.allIn,
    pot: potSoFar(asState(draft)),
  });
}

// ---------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------

function openBettingRound(draft: PokerDraft, first: SeatId): void {
  const canAct = actingSeats(asState(draft));
  const live = bettingPossible(asState(draft));
  for (let seat = 0; seat < draft.seats; seat++) {
    draft.needsToAct[seat] = live && canAct.includes(seat);
    draft.mayRaise[seat] = true;
  }
  draft.turn = live ? actorFrom(asState(draft), first) : null;
}

/**
 * Starts a hand: button on, blinds posted, two cards to every live seat.
 *
 * The deck is handed in already shuffled so the caller owns the randomness —
 * setup takes it from the session rng, and later hands from the move's.
 */
function beginHand(draft: PokerDraft, order: readonly CardId[], ctx: MoveCtx): void {
  draft.hole = Array.from({ length: draft.seats }, () => []);
  draft.board = [];
  draft.deck = [...order];
  draft.street = 'preflop';
  draft.folded = Array.from({ length: draft.seats }, (_, seat) => draft.out[seat] === true);
  draft.allIn = Array.from({ length: draft.seats }, () => false);
  draft.committed = Array.from({ length: draft.seats }, () => 0);
  draft.streetBet = Array.from({ length: draft.seats }, () => 0);
  draft.shown = Array.from({ length: draft.seats }, () => false);
  draft.actions = [];
  draft.summary = null;
  draft.aggressor = null;

  ctx.fx.emit(Fx.ShuffleStock, { cards: order.length });
  ctx.fx.emit(PokerFx.Button, { seat: draft.button });

  const { small, big } = blindsForLevel(draft.level);
  const ante = anteForLevel(draft.level, draft.rules);

  const smallSeat = smallBlindSeat(asState(draft));
  const bigSeat = bigBlindSeat(asState(draft));

  if (ante > 0) {
    // Big-blind ante: one seat posts for the whole table. It buys the same dead
    // money as everyone anteing without four extra chip animations a hand.
    const paid = commitChips(draft, bigSeat, ante, { asBet: false });
    if (paid > 0) record(draft, bigSeat, 'ante', paid, ctx);
  }

  const smallPaid = commitChips(draft, smallSeat, small, { asBet: true });
  if (smallPaid > 0) record(draft, smallSeat, 'blind', smallPaid, ctx);
  const bigPaid = commitChips(draft, bigSeat, big, { asBet: true });
  if (bigPaid > 0) record(draft, bigSeat, 'blind', bigPaid, ctx);

  // The bet to match is the posted blind even when the seat could not cover it.
  draft.currentBet = big;
  draft.lastRaiseSize = big;

  let cursor = 0;
  for (let round = 0; round < HOLE_CARDS; round++) {
    for (const seat of dealOrder(draft)) {
      const card = draft.deck[cursor++] as CardId;
      (draft.hole[seat] as CardId[]).push(card);
      ctx.fx.emit(
        Fx.DealCard,
        { card: '??', from: 'stock', to: `hand:${seat}`, dur: 220 },
        (cursor - 1) * DEAL_STAGGER_MS,
      );
    }
  }
  draft.deck = draft.deck.slice(cursor);

  openBettingRound(draft, firstToActPreflop(asState(draft)));
  if (draft.turn !== null) {
    ctx.fx.emit(Fx.TurnRing, { seat: draft.turn }, cursor * DEAL_STAGGER_MS);
  }
}

/** Seats in deal order: first card to the left of the button. */
function dealOrder(draft: PokerDraft): SeatId[] {
  const live = livingSeats(asState(draft));
  const start = nextLiving(asState(draft), draft.button);
  const at = live.indexOf(start);
  return [...live.slice(at), ...live.slice(0, at)];
}

const STREET_AFTER: Readonly<Record<string, Street>> = {
  preflop: 'flop',
  flop: 'turn',
  turn: 'river',
};

const CARDS_FOR_STREET: Readonly<Record<string, number>> = {
  flop: 3,
  turn: 1,
  river: 1,
};

// ---------------------------------------------------------------------------
// Player moves
// ---------------------------------------------------------------------------

function turnFault(state: PokerState, seat: SeatId): RuleError | null {
  if (state.street === 'showdown' || state.street === 'hand-over') {
    return err('hand-over', 'this hand is finished');
  }
  if (state.turn !== seat) return err('not-your-turn', 'it is not your turn');
  if (state.folded[seat]) return err('folded', 'this seat has folded');
  if (state.allIn[seat]) return err('all-in', 'this seat is already all-in');
  return null;
}

/** Hands the turn to the next seat, or leaves it null when the round is closed. */
function passTurn(draft: PokerDraft, from: SeatId, ctx: MoveCtx): void {
  const next = nextActor(asState(draft), from);
  draft.turn = next;
  if (next !== null) ctx.fx.emit(Fx.TurnRing, { seat: next }, 120);
}

const fold: Move<PokerState> = {
  validate(state, seat) {
    return turnFault(state, seat) ?? true;
  },
  apply(state, seat, _payload, ctx) {
    const draft = toDraft(state);
    draft.folded[seat] = true;
    draft.needsToAct[seat] = false;
    record(draft, seat, 'fold', 0, ctx);
    passTurn(draft, seat, ctx);
    return fromDraft(draft);
  },
};

const check: Move<PokerState> = {
  validate(state, seat) {
    const fault = turnFault(state, seat);
    if (fault) return fault;
    if (toCall(state, seat) > 0) return err('bet-to-call', 'there is a bet to call');
    return true;
  },
  apply(state, seat, _payload, ctx) {
    const draft = toDraft(state);
    draft.needsToAct[seat] = false;
    record(draft, seat, 'check', 0, ctx);
    passTurn(draft, seat, ctx);
    return fromDraft(draft);
  },
};

const call: Move<PokerState> = {
  validate(state, seat) {
    const fault = turnFault(state, seat);
    if (fault) return fault;
    if (toCall(state, seat) <= 0) return err('nothing-to-call', 'there is nothing to call');
    return true;
  },
  apply(state, seat, _payload, ctx) {
    const draft = toDraft(state);
    const paid = commitChips(draft, seat, toCall(state, seat), { asBet: true });
    draft.needsToAct[seat] = false;
    record(draft, seat, 'call', paid, ctx);
    passTurn(draft, seat, ctx);
    return fromDraft(draft);
  },
};

function aggressionFault(state: PokerState, seat: SeatId, opening: boolean): RuleError | null {
  const fault = turnFault(state, seat);
  if (fault) return fault;
  if (!bettingPossible(state)) {
    return err('no-one-to-bet-into', 'nobody left has chips to call a bet');
  }
  if (opening && state.currentBet > 0) return err('already-a-bet', 'raise instead of betting');
  if (!opening && state.currentBet === 0) return err('no-bet-yet', 'bet instead of raising');
  if (!state.mayRaise[seat]) {
    return err('action-not-reopened', 'a short all-in did not reopen the betting');
  }
  return null;
}

function amountFault(state: PokerState, seat: SeatId, to: number | null): RuleError | null {
  if (to === null || to <= 0) return err('bad-amount', 'expected {to} as a whole number of chips');
  const shove = allInTo(state, seat);
  if (to > shove) return err('short-stack', `this seat can put in at most ${shove}`);
  if (to <= state.currentBet) return err('too-small', 'a raise must be more than the current bet');
  const floor = minRaiseTo(state);
  // Below the minimum is legal only as a shove — that is what being short means.
  if (to < floor && to !== shove) {
    return err('below-minimum', `raise to at least ${floor}, or go all-in`);
  }
  return null;
}

function applyAggression(
  state: PokerState,
  seat: SeatId,
  to: number,
  kind: 'bet' | 'raise',
  ctx: MoveCtx,
): PokerState {
  const draft = toDraft(state);
  const increment = to - state.currentBet;
  const fullRaise = increment >= state.lastRaiseSize;

  const paid = commitChips(draft, seat, to - (state.streetBet[seat] as number), { asBet: true });

  for (const other of actingSeats(state)) {
    if (other === seat) continue;
    draft.needsToAct[other] = true;
    // An all-in too small to be a full raise puts more chips at risk but does
    // not hand the players who already acted a fresh right to re-raise.
    if (!fullRaise && !state.needsToAct[other]) draft.mayRaise[other] = false;
  }
  draft.needsToAct[seat] = false;
  draft.currentBet = Math.max(state.currentBet, draft.streetBet[seat] as number);
  if (fullRaise) draft.lastRaiseSize = increment;
  draft.aggressor = seat;

  record(draft, seat, kind, paid, ctx);
  passTurn(draft, seat, ctx);
  return fromDraft(draft);
}

const bet: Move<PokerState> = {
  validate(state, seat, payload) {
    return (
      aggressionFault(state, seat, true) ?? amountFault(state, seat, payloadAmount(payload)) ?? true
    );
  },
  apply(state, seat, payload, ctx) {
    return applyAggression(state, seat, payloadAmount(payload) as number, 'bet', ctx);
  },
};

const raise: Move<PokerState> = {
  validate(state, seat, payload) {
    return (
      aggressionFault(state, seat, false) ??
      amountFault(state, seat, payloadAmount(payload)) ??
      true
    );
  },
  apply(state, seat, payload, ctx) {
    return applyAggression(state, seat, payloadAmount(payload) as number, 'raise', ctx);
  },
};

// ---------------------------------------------------------------------------
// System moves
// ---------------------------------------------------------------------------

const dealStreet: Move<PokerState> = {
  validate(state) {
    const next = STREET_AFTER[state.street];
    if (!next) return err('no-street-left', 'the board is already complete');
    if (!bettingClosed(state)) return err('betting-open', 'the betting round is not finished');
    return true;
  },
  apply(state, _seat, _payload, ctx) {
    const draft = toDraft(state);
    const next = STREET_AFTER[state.street] as Street;
    const count = CARDS_FOR_STREET[next] as number;

    const dealt = draft.deck.slice(0, count);
    draft.deck = draft.deck.slice(count);
    draft.board = [...draft.board, ...dealt];
    draft.street = next;

    dealt.forEach((card, index) => {
      ctx.fx.emit(
        Fx.DealCard,
        { card, from: 'stock', to: `board:${draft.board.length - dealt.length + index}`, dur: 240 },
        index * BOARD_STAGGER_MS,
      );
    });
    ctx.fx.emit(
      PokerFx.Street,
      { street: next, cards: dealt, board: draft.board, pot: potSoFar(asState(draft)) },
      count * BOARD_STAGGER_MS,
    );

    // Chips in front of the seats go to the middle and the round starts fresh.
    draft.streetBet = Array.from({ length: draft.seats }, () => 0);
    draft.currentBet = 0;
    draft.lastRaiseSize = blindsForLevel(draft.level).big;
    draft.aggressor = null;
    openBettingRound(draft, firstToActPostflop(asState(draft)));

    return fromDraft(draft);
  },
};

function rankFor(draft: PokerDraft, seat: SeatId): HandRank {
  return rankHand([...(draft.hole[seat] as CardId[]), ...draft.board]);
}

/** Simultaneous busts are ordered by what they had in the middle — the bigger stack finishes higher. */
function bustedThisHand(draft: PokerDraft, before: readonly number[]): SeatId[] {
  return livingSeats(asState(draft))
    .filter((seat) => (draft.stacks[seat] as number) <= 0)
    .sort((left, right) => (before[left] as number) - (before[right] as number));
}

const settle: Move<PokerState> = {
  validate(state) {
    if (state.street === 'hand-over') return err('already-settled', 'this hand is already scored');
    const done =
      contestingSeats(state).length <= 1 || (state.street === 'river' && bettingClosed(state));
    if (!done) return err('hand-in-progress', 'the hand is still being played');
    return true;
  },
  apply(state, _seat, _payload, ctx) {
    const draft = toDraft(state);
    const contributed = [...draft.committed];
    const pots = buildPots(draft.committed, draft.folded);
    const contenders = contestingSeats(asState(draft));
    const walkover = contenders.length <= 1;

    ctx.fx.emit(PokerFx.PotCollect, { pots, total: potTotal(pots) }, COLLECT_DELAY_MS);

    const ranks: (HandRank | null)[] = Array.from({ length: draft.seats }, () => null);
    let payouts: number[];
    let awards;

    if (walkover) {
      const winner = contenders[0] ?? draft.button;
      ({ payouts, awards } = awardUncontested(pots, winner, draft.seats));
    } else {
      for (const seat of contenders) ranks[seat] = rankFor(draft, seat);
      ({ payouts, awards } = awardPots(pots, ranks, draft.button, draft.seats));
    }

    const winners = new Set(awards.map((award) => award.seat));
    const shownHands: ShownHand[] = contenders.map((seat) => {
      // At a real table the winner shows and a beaten hand can muck. Walkovers
      // never show at all — there was nothing to beat.
      const reveal = !walkover && (winners.has(seat) || draft.rules.showMucked);
      draft.shown[seat] = reveal;
      return {
        seat,
        hole: [...(draft.hole[seat] as CardId[])],
        rank: walkover ? null : (ranks[seat] as HandRank | null),
        mucked: !reveal,
      };
    });

    if (!walkover) {
      ctx.fx.emit(
        PokerFx.Showdown,
        {
          shown: shownHands
            .filter((entry) => !entry.mucked)
            .map((entry) => ({ seat: entry.seat, hole: entry.hole, label: entry.rank?.label })),
        },
        COLLECT_DELAY_MS,
      );
      for (const entry of shownHands) {
        if (entry.mucked) ctx.fx.emit(PokerFx.Muck, { seat: entry.seat }, COLLECT_DELAY_MS);
        else ctx.fx.emit(Fx.ShowdownReveal, { seat: entry.seat, hand: entry.rank?.label });
      }
    }

    for (const award of awards) {
      draft.stacks[award.seat] = (draft.stacks[award.seat] as number) + award.amount;
      ctx.fx.emit(
        PokerFx.Award,
        { seat: award.seat, amount: award.amount, potIndex: award.potIndex },
        AWARD_DELAY_MS,
      );
    }

    const busted = bustedThisHand(draft, contributed);
    for (const seat of busted) {
      draft.out[seat] = true;
      draft.bustOrder.push(seat);
      ctx.fx.emit(
        PokerFx.Bust,
        { seat, place: draft.seats - draft.bustOrder.length + 1 },
        AWARD_DELAY_MS,
      );
    }

    const summary: HandSummary = {
      handNo: draft.handNo,
      button: draft.button,
      board: [...draft.board],
      pots,
      awards,
      net: Array.from(
        { length: draft.seats },
        (_, seat) => (payouts[seat] as number) - (contributed[seat] as number),
      ),
      stacksAfter: [...draft.stacks],
      shown: shownHands,
      walkover,
      busted,
    };

    // The chips are in their stacks now, so the middle is empty. Keeping the
    // contributions here as well would double-count every settled pot; what
    // each seat put in survives on the summary, where it belongs.
    draft.committed = Array.from({ length: draft.seats }, () => 0);
    draft.streetBet = Array.from({ length: draft.seats }, () => 0);
    draft.currentBet = 0;
    // Nobody is all-in between hands — the winner of an all-in pot has chips
    // again, and leaving the flag up would say otherwise.
    draft.allIn = Array.from({ length: draft.seats }, () => false);
    draft.street = 'hand-over';
    draft.turn = null;
    draft.summary = summary;
    draft.lastHand = summary;
    ctx.fx.emit(Fx.RoundEnd, { reason: walkover ? 'walkover' : 'showdown' }, AWARD_DELAY_MS);
    return fromDraft(draft);
  },
};

const nextHand: Move<PokerState> = {
  validate(state) {
    if (state.street !== 'hand-over') return err('hand-in-progress', 'the hand is not finished');
    if (livingSeats(state).length <= 1) return err('match-over', 'the match is decided');
    return true;
  },
  apply(state, _seat, _payload, ctx) {
    const draft = toDraft(state);
    draft.handNo += 1;
    draft.handsThisLevel += 1;
    if (draft.handsThisLevel >= handsPerLevel(draft.rules.blindSpeed)) {
      draft.handsThisLevel = 0;
      draft.level += 1;
      const blinds = blindsForLevel(draft.level);
      ctx.fx.emit(PokerFx.BlindsUp, {
        level: draft.level,
        small: blinds.small,
        big: blinds.big,
        ante: anteForLevel(draft.level, draft.rules),
      });
    }
    draft.button = nextLiving(asState(draft), draft.button);
    beginHand(draft, ctx.rng.shuffle(fullDeck()), ctx);
    return fromDraft(draft);
  },
};

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

function matchEndResult(state: PokerState): MatchResult | null {
  if (state.street !== 'hand-over') return null;
  const standing = livingSeats(state);
  if (standing.length > 1) return null;
  const winner = standing[0] ?? null;
  const order = [...(winner === null ? [] : [winner]), ...[...state.bustOrder].reverse()];
  return {
    winner,
    rankings: order.map((seat, index) => ({
      seat,
      rank: index + 1,
      detail: { chips: state.stacks[seat] ?? 0, hands: state.handNo },
    })),
    reason: 'last stack standing',
  };
}

function phaseFor(state: PokerState): PhaseState {
  if (state.street === 'hand-over') {
    return { phase: 'hand-over', actor: null, round: state.handNo };
  }
  return { phase: state.street, actor: state.turn, round: state.handNo };
}

function legalForSeat(state: PokerState, seat: SeatId): LegalMove[] {
  if (state.turn !== seat) return [];
  if (turnFault(state, seat)) return [];

  const moves: LegalMove[] = [{ id: 'fold' }];
  const owed = toCall(state, seat);
  if (owed === 0) moves.push({ id: 'check' });
  else moves.push({ id: 'call', payload: { amount: owed } });

  if (canRaise(state, seat)) {
    const id = state.currentBet === 0 ? 'bet' : 'raise';
    for (const to of raiseLadder(state, seat)) moves.push({ id, payload: { to } });
  }

  return moves;
}

const flow: GameDef<PokerState, PokerRules>['flow'] = {
  start: (state) => phaseFor(state),

  legalMoves(state, phase) {
    if (phase.actor === null) return [];
    return legalForSeat(state, phase.actor);
  },

  legalMovesFor(state, _phase, seat) {
    return legalForSeat(state, seat);
  },

  advance(state): FlowAdvance {
    if (state.street === 'hand-over') {
      const ended = matchEndResult(state);
      if (ended) return { phase: phaseFor(state), ended };
      return {
        phase: phaseFor(state),
        autoMoves: [{ seat: null, move: 'nextHand', reason: 'next deal' }],
      };
    }

    // Everyone folded to one seat — the hand is over wherever it stands.
    if (contestingSeats(state).length <= 1) {
      return {
        phase: phaseFor(state),
        autoMoves: [{ seat: null, move: 'settle', reason: 'everyone folded' }],
      };
    }

    if (bettingClosed(state)) {
      const move = state.street === 'river' ? 'settle' : 'dealStreet';
      return {
        phase: phaseFor(state),
        autoMoves: [
          { seat: null, move, reason: move === 'settle' ? 'showdown' : 'betting complete' },
        ],
      };
    }

    return { phase: phaseFor(state) };
  },
};

// ---------------------------------------------------------------------------
// The pack
// ---------------------------------------------------------------------------

export interface PokerDefOptions {
  bots?: readonly BotPolicy<PokerState>[];
}

function emptyMatch(config: PokerRules, seats: number): PokerDraft {
  const zeroes = Array.from({ length: seats }, () => 0);
  return {
    rules: config,
    seats,
    handNo: 1,
    level: 0,
    handsThisLevel: 0,
    button: 0,
    stacks: Array.from({ length: seats }, () => config.startingStack),
    out: Array.from({ length: seats }, () => false),
    bustOrder: [],
    hole: Array.from({ length: seats }, () => []),
    board: [],
    deck: [],
    street: 'preflop',
    folded: Array.from({ length: seats }, () => false),
    allIn: Array.from({ length: seats }, () => false),
    committed: [...zeroes],
    streetBet: [...zeroes],
    currentBet: 0,
    lastRaiseSize: 0,
    needsToAct: Array.from({ length: seats }, () => false),
    mayRaise: Array.from({ length: seats }, () => true),
    turn: null,
    aggressor: null,
    shown: Array.from({ length: seats }, () => false),
    actions: [],
    summary: null,
    lastHand: null,
  };
}

/**
 * Headless no-limit hold'em: a whole sit-and-go inside one deterministic
 * session. Stacks, blinds, the button and the bust order all live on the state,
 * so a replay of the log reproduces the match exactly.
 */
export function createPokerDef(options: PokerDefOptions = {}): GameDef<PokerState, PokerRules> {
  const bots = options.bots ?? TIER_BOTS;
  return {
    id: GAME_ID,
    howToPlay: pokerHowToPlay,
    configSchema: pokerConfig,

    setup(ctx) {
      if (!Number.isInteger(ctx.seats) || ctx.seats < MIN_SEATS || ctx.seats > MAX_SEATS) {
        throw new Error(`poker seats ${MIN_SEATS}–${MAX_SEATS}, got ${ctx.seats}`);
      }
      const draft = emptyMatch(ctx.config, ctx.seats);
      beginHand(draft, ctx.rng.shuffle(fullDeck()), {
        rng: ctx.rng,
        fx: ctx.fx,
        event: { seq: 0 },
      });
      return fromDraft(draft);
    },

    moves: { fold, check, call, bet, raise, dealStreet, settle, nextHand },

    flow,

    /**
     * What one seat may see: their own two cards, the board, and any hand that
     * has been turned face up. The undealt remainder is stripped outright —
     * a view that carried the rest of the deck would hand the next three
     * community cards to anyone who looked.
     */
    playerView(state, seat) {
      return {
        ...state,
        deck: [],
        hole: state.hole.map((cards, index) =>
          index === seat || state.shown[index] ? [...cards] : cards.map(() => '??'),
        ),
      };
    },

    end(state) {
      return matchEndResult(state);
    },

    bots,
  };
}

export const pokerGame = createPokerDef();

/** playerView is a redacted PokerState — same shape, hidden cards are `??`. */
export type PokerPlayerView = PokerState;

export function phaseForState(state: PokerState): PhaseState {
  return phaseFor(state);
}

export { BOARD_CARDS, MAX_SEATS, MIN_SEATS };
