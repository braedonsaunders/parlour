import {
  advanceSeat,
  Fx,
  dealOrder,
  drawFrom,
  isVeilHandle,
  stdDeck,
  veilSupport,
  type BotPolicy,
  type CardId,
  type Flow,
  type GameDef,
  type LegalMove,
  type MatchResult,
  type Move,
  type MoveCtx,
  type PhaseState,
  type RuleError,
  type SeatId,
} from '@parlour/engine';
import { ratscrewConfigSchema, type RatscrewConfig } from './config';
import { ratscrewHowToPlay } from './howto';
import { chancesFor, detectPattern, isFaceCard, type SlapPattern } from './patterns';

export { ratscrewHowToPlay } from './howto';

export { ratscrewConfigSchema, type RatscrewConfig } from './config';
export {
  detectPattern,
  chancesFor,
  isFaceCard,
  isRun,
  rankOf,
  SLAP_PATTERN_PRIORITY,
  type SlapPattern,
} from './patterns';

/** Ratscrew supports 2–4 seats, matching parlour room capacity. */
export const RATSCREW_MIN_SEATS = 2;
export const RATSCREW_MAX_SEATS = 4;

/**
 * Extra milliseconds the transport authority keeps accepting slap intents past
 * `slapWindowMs` so a remote player's tap still races fairly across network
 * latency. The engine itself stays arrival-order deterministic: whatever the
 * authority logs first wins, and anything logged after the injected
 * `windowClose` becomes a plain mis-slap.
 */
export const SLAP_GRACE_MS = 150;

export interface RatscrewChallenge {
  /** seat who laid the face card and will win the pile if the target fails */
  challenger: SeatId;
  /** seat owing flips */
  target: SeatId;
  chancesLeft: number;
}

export interface RatscrewWindow {
  pattern: SlapPattern;
  /**
   * Authority time the window opened (`atMs` of the triggering flip) or null
   * when the room does not stamp event times. Transports schedule
   * `windowClose` no earlier than `openedAtMs + slapWindowMs`; the value rides
   * in the log, so replays reproduce every timing decision.
   */
  openedAtMs: number | null;
}

export interface RatscrewState {
  rules: RatscrewConfig;
  seats: number;
  /** face-down personal stacks; index 0 is the TOP (next card to flip) */
  piles: readonly CardId[][];
  /** center pile; index 0 is the BOTTOM, last entry is the top card */
  center: readonly CardId[];
  /** seat that must flip next (always holds cards while the match runs) */
  turn: SeatId;
  challenge: RatscrewChallenge | null;
  /** open slap window — eligible seats race until an authority closes it */
  window: RatscrewWindow | null;
  /**
   * Pile collection resolved by the last flip but paused behind an open slap
   * window; paid out on windowClose unless someone slaps first.
   */
  pendingWin: SeatId | null;
  lastFlipper: SeatId;
  /**
   * True when the room deals under Veil: every pile holds opaque handles and a
   * flip must arrive with the opening that turns its top card face up. Rat
   * Screw is the natural fit — nobody, not even the owner, is meant to know
   * what is under their own stack.
   */
  veiled: boolean;
}

const RATSCREW_DECK = stdDeck();

function error(code: string, message: string): RuleError {
  return { code, message };
}

function pileOf(state: RatscrewState, seat: SeatId): readonly CardId[] {
  return state.piles[seat] ?? [];
}

function aliveSeats(state: RatscrewState): SeatId[] {
  const alive: SeatId[] = [];
  for (let seat = 0; seat < state.seats; seat++) {
    if (pileOf(state, seat).length > 0) alive.push(seat);
  }
  return alive;
}

function nextAlive(state: RatscrewState, from: SeatId): SeatId {
  const alive = aliveSeats(state);
  for (let step = 1; step <= state.seats; step++) {
    const seat = advanceSeat(from, state.seats, step);
    if (alive.includes(seat)) return seat;
  }
  return from;
}

/** Seats allowed to slap a live window: card holders, plus everyone when re-entry is on. */
function slapEligibleSeats(state: RatscrewState): SeatId[] {
  const ordered: SeatId[] = [];
  const start = advanceSeat(state.lastFlipper, state.seats);
  for (let step = 0; step < state.seats; step++) {
    const seat = advanceSeat(start, state.seats, step);
    const hasCards = pileOf(state, seat).length > 0;
    if (hasCards || state.rules.slapBackIn) ordered.push(seat);
  }
  return ordered;
}

function phaseFor(state: RatscrewState): PhaseState {
  if (state.window) {
    return { phase: 'slap', actor: null, actors: slapEligibleSeats(state), round: 1 };
  }
  // With mis-slap burns enabled, every card holder may slam at any moment, so
  // they all count as acting seats; the turn rider stays in `actor` for UI.
  const actors = state.rules.misSlapBurn ? aliveSeats(state) : undefined;
  return { phase: 'flip', actor: state.turn, actors, round: 1 };
}

function collectCenter(state: RatscrewState, seat: SeatId, ctx: MoveCtx): RatscrewState {
  if (state.center.length === 0) return state;
  ctx.fx.emit('ratscrew.pile-win', { seat, cards: state.center.length });
  return {
    ...state,
    piles: state.piles.map((pile, index) => (index === seat ? [...pile, ...state.center] : pile)),
    center: [],
  };
}

const flip: Move<RatscrewState> = {
  validate(state, seat) {
    if (state.window) return error('window-open', 'a slap window is open');
    if (state.turn !== seat) return error('not-your-turn', 'seat is not flipping this turn');
    if (pileOf(state, seat).length === 0) return error('empty-pile', 'seat has no cards');
    // A veiled flip only becomes legal once the room has peeled the handle, so
    // a client can never push an unopened card into the public center pile.
    if (isVeilHandle(pileOf(state, seat)[0])) {
      return error('card-still-veiled', 'the flipped card has not been opened yet');
    }
    return true;
  },
  apply(state, seat, _payload, ctx) {
    const pile = pileOf(state, seat);
    const take = drawFrom(pile, 1);
    const card = take.drawn[0];
    if (!card) throw new Error('flip apply requires a card');

    const center = [...state.center, card];
    const piles = state.piles.map((cards, index) => (index === seat ? take.rest : cards));
    let next: RatscrewState = {
      ...state,
      piles,
      center,
      lastFlipper: seat,
    };
    ctx.fx.emit(Fx.FlipCard, { card, seat, to: 'center' });

    let pendingWin: SeatId | null = null;
    if (isFaceCard(card)) {
      const target = nextAlive(next, seat);
      if (target !== seat) {
        next = {
          ...next,
          turn: target,
          challenge: { challenger: seat, target, chancesLeft: chancesFor(card) },
        };
        ctx.fx.emit(
          'ratscrew.challenge',
          { challenger: seat, target, chancesLeft: chancesFor(card) },
          120,
        );
      }
    } else if (next.challenge) {
      const challenge = next.challenge;
      const chancesLeft = challenge.chancesLeft - 1;
      // out of chances, or out of cards to answer with — either way the
      // challenger scoops the pile
      const targetEmpty = pileOf(next, challenge.target).length === 0;
      if (chancesLeft <= 0 || targetEmpty) {
        pendingWin = challenge.challenger;
        next = { ...next, turn: challenge.challenger, challenge: null };
      } else {
        next = {
          ...next,
          turn: challenge.target,
          challenge: { ...challenge, chancesLeft },
        };
        ctx.fx.emit(
          'ratscrew.challenge',
          {
            challenger: challenge.challenger,
            target: challenge.target,
            chancesLeft,
          },
          120,
        );
      }
    } else {
      next = { ...next, turn: nextAlive(next, seat) };
    }

    const pattern = detectPattern(center, next.rules);
    if (pattern) {
      ctx.fx.emit('ratscrew.slap-window', { pattern, by: seat }, 60);
      return {
        ...next,
        window: { pattern, openedAtMs: ctx.event.atMs ?? null },
        pendingWin,
      };
    }

    ctx.fx.emit(Fx.TurnRing, { seat: next.turn }, 80);
    if (pendingWin !== null) {
      next = collectCenter(next, pendingWin, ctx);
    }
    return { ...next, pendingWin: null };
  },
};

const slap: Move<RatscrewState> = {
  validate(state, seat) {
    const hasCards = pileOf(state, seat).length > 0;
    if (state.window) {
      if (hasCards || state.rules.slapBackIn) return true;
      return error('empty-pile', 'out of cards and slap-back-in is off');
    }
    // No live pattern: the attempt stands only as a penalty slap.
    if (!state.rules.misSlapBurn) return error('no-window', 'nothing is slappable right now');
    if (!hasCards) return error('empty-pile', 'nothing left to burn');
    return true;
  },
  apply(state, seat, _payload, ctx) {
    if (state.window) {
      const pattern = state.window.pattern;
      const comeback = pileOf(state, seat).length === 0;
      ctx.fx.emit('ratscrew.slap', {
        seat,
        pattern,
        cards: state.center.slice(-3).reverse(),
      });
      if (comeback) ctx.fx.emit('ratscrew.comeback', { seat }, 120);
      const collected = collectCenter(
        { ...state, window: null, pendingWin: null, challenge: null },
        seat,
        ctx,
      );
      ctx.fx.emit(Fx.TurnRing, { seat }, 80);
      return { ...collected, turn: seat };
    }

    // Mis-slap: the top card of the slapper's stack burns under the center
    // pile. Challenges and turns are untouched — a burn is never a flip.
    const pile = pileOf(state, seat);
    const take = drawFrom(pile, 1);
    const burned = take.drawn[0];
    if (!burned) throw new Error('mis-slap apply requires a card');
    ctx.fx.emit('ratscrew.misslap', { seat });
    ctx.fx.emit('ratscrew.burn', { seat, card: burned }, 90);
    let next: RatscrewState = {
      ...state,
      piles: state.piles.map((cards, index) => (index === seat ? take.rest : cards)),
      center: [...state.center, burned],
    };
    // Burning your own last card mid-turn must not strand the flip on an
    // empty stack — ride the turn forward to the next player holding cards.
    if (next.turn === seat && take.rest.length === 0 && aliveSeats(next).length > 0) {
      next = { ...next, turn: nextAlive(next, seat) };
      ctx.fx.emit(Fx.TurnRing, { seat: next.turn }, 80);
    }
    return next;
  },
};

/**
 * Closes an open slap window without a winner. Injected by the transport
 * authority after `slapWindowMs` (plus {@link SLAP_GRACE_MS}); replay
 * reproduces it bit-for-bit because the injection lands in the log.
 */
const windowClose: Move<RatscrewState> = {
  validate(state) {
    return state.window ? true : error('no-window', 'no slap window is open');
  },
  apply(state, _seat, _payload, ctx) {
    const payout = state.pendingWin;
    let next: RatscrewState = { ...state, window: null, pendingWin: null };
    if (payout !== null) {
      next = collectCenter(next, payout, ctx);
      next = { ...next, turn: payout };
    }
    ctx.fx.emit(Fx.TurnRing, { seat: next.turn }, 80);
    return next;
  },
};

/** Auto-move: the challenged seat burnt or flipped away their last answer. */
const challengeForfeit: Move<RatscrewState> = {
  validate(state) {
    if (!state.challenge) return error('no-challenge', 'no face-card challenge is live');
    if (pileOf(state, state.challenge.target).length > 0) {
      return error('target-has-cards', 'the challenged seat can still flip');
    }
    return true;
  },
  apply(state, _seat, _payload, ctx) {
    const challenge = state.challenge;
    if (!challenge) throw new Error('forfeit apply requires a challenge');
    const paid = collectCenter({ ...state, challenge: null }, challenge.challenger, ctx);
    ctx.fx.emit(Fx.TurnRing, { seat: challenge.challenger }, 80);
    return { ...paid, turn: challenge.challenger };
  },
};

/** Auto-move: every stack ran dry mid-race — the last flipper gathers the pile. */
const exhaustedScoop: Move<RatscrewState> = {
  validate(state) {
    if (state.window) return error('window-open', 'a slap window is open');
    if (aliveSeats(state).length > 0) return error('seats-remain', 'someone still holds cards');
    if (state.center.length === 0) return error('empty-center', 'the pile is already gone');
    return true;
  },
  apply(state, _seat, _payload, ctx) {
    const scooped = collectCenter(state, state.lastFlipper, ctx);
    ctx.fx.emit(Fx.TurnRing, { seat: state.lastFlipper }, 80);
    return { ...scooped, turn: state.lastFlipper };
  },
};

function legalMovesForSeat(
  state: RatscrewState,
  phase: PhaseState,
  seat: SeatId,
): readonly LegalMove[] {
  if (phase.phase === 'slap') {
    return (phase.actors ?? []).includes(seat) ? [{ id: 'slap' }] : [];
  }
  const moves: LegalMove[] = [];
  const hasCards = pileOf(state, seat).length > 0;
  if (phase.actor === seat && hasCards) moves.push({ id: 'flip' });
  if (state.rules.misSlapBurn && hasCards) moves.push({ id: 'slap' });
  return moves;
}

const flow: Flow<RatscrewState> = {
  start(state) {
    return phaseFor(state);
  },
  legalMoves(state) {
    return legalMovesForSeat(state, phaseFor(state), phaseFor(state).actor ?? -1);
  },
  legalMovesFor(state, phase, seat) {
    return legalMovesForSeat(state, phase, seat);
  },
  advance(state) {
    const challenge = state.challenge;
    if (challenge && pileOf(state, challenge.target).length === 0) {
      return {
        phase: phaseFor(state),
        autoMoves: [{ seat: null, move: 'challengeForfeit', reason: 'challenge-target-empty' }],
      };
    }
    if (
      !state.window &&
      !state.challenge &&
      aliveSeats(state).length === 0 &&
      state.center.length > 0
    ) {
      return {
        phase: phaseFor(state),
        autoMoves: [{ seat: null, move: 'exhaustedScoop', reason: 'deck-exhausted' }],
      };
    }
    const ended = result(state);
    return ended ? { phase: phaseFor(state), ended } : { phase: phaseFor(state) };
  },
  canInject(state, phase, moveId, _payload, meta) {
    if (moveId !== 'windowClose') {
      return error('injection-refused', `ratscrew does not accept injected ${moveId}`);
    }
    if (phase.phase !== 'slap' || !state.window) {
      return error('no-window', 'no slap window is open');
    }
    const { openedAtMs } = state.window;
    if (openedAtMs !== null && meta.atMs !== undefined) {
      const earliest = openedAtMs + state.rules.slapWindowMs;
      if (meta.atMs < earliest) {
        return error('window-too-young', `the slap window stays open until ${earliest}ms`);
      }
    }
    return true;
  },
};

function result(state: RatscrewState): MatchResult | null {
  if (state.window) return null;
  const alive = aliveSeats(state);
  if (alive.length > 1) return null;
  // With re-entry on, an abandoned center pile still owes the table a comeback
  // chance — the match waits until it has been scooped into one stack.
  if (state.rules.slapBackIn && state.center.length > 0) return null;
  const counts = state.piles.map((pile, seat) => ({ seat, cards: pile.length }));
  const rankings = counts
    .slice()
    .sort((a, b) => b.cards - a.cards || a.seat - b.seat)
    .map((entry, index) => ({
      seat: entry.seat,
      rank: alive[0] === entry.seat ? 1 : index + 1,
      detail: { cards: entry.cards },
    }));
  return {
    winner: alive[0] ?? null,
    rankings,
    reason: alive.length === 1 ? 'last-standing' : 'deck-exhausted',
  };
}

export const houseBot: BotPolicy<RatscrewState> = {
  id: 'ratscrew-house-bot',
  label: 'House Bot',
  tier: 2,
  chooseMove(_view, _seat, legal) {
    return (
      legal.find((move) => move.id === 'flip') ?? legal.find((move) => move.id === 'slap') ?? null
    );
  },
};

export const ratscrewGame: GameDef<RatscrewState, RatscrewConfig> = {
  id: 'ratscrew',
  configSchema: ratscrewConfigSchema,
  howToPlay: ratscrewHowToPlay,
  // Veil, inherited: every card is dealt face down, so nothing is opened before
  // the deal and a flip is the only thing that ever turns a card face up.
  veil: veilSupport({ deck: RATSCREW_DECK }),
  setup(ctx) {
    const { config, seats, fx } = ctx;
    if (!Number.isInteger(seats) || seats < RATSCREW_MIN_SEATS || seats > RATSCREW_MAX_SEATS) {
      throw new Error(`ratscrew requires ${RATSCREW_MIN_SEATS}–${RATSCREW_MAX_SEATS} seats`);
    }
    const shuffled = dealOrder(ctx, RATSCREW_DECK);
    const piles: CardId[][] = Array.from({ length: seats }, () => []);
    for (let index = 0; index < shuffled.length; index++) {
      const card = shuffled[index] as CardId;
      piles[index % seats]!.push(card);
      fx.emit(
        Fx.DealCard,
        { card, from: 'stock', to: `hand:${index % seats}`, dur: 220 },
        index * 24,
      );
    }
    // last card dealt sits on top of each stack (index 0 is the top)
    for (const pile of piles) pile.reverse();
    return {
      rules: config,
      seats,
      piles,
      center: [],
      turn: 0,
      challenge: null,
      window: null,
      pendingWin: null,
      lastFlipper: 0,
      veiled: ctx.veiled === true,
    };
  },
  moves: { flip, slap, windowClose, challengeForfeit, exhaustedScoop },
  flow,
  playerView(state) {
    return {
      ...state,
      // nobody peeks at stack order — not even their own
      piles: state.piles.map((pile) => pile.map(() => '??' as CardId)),
    };
  },
  end: result,
  bots: [houseBot],
};
