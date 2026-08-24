import {
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
export { detectPattern, isFaceCard, rankOf, type SlapPattern } from './patterns';

export interface RatscrewChallenge {
  /** seat who laid the face card and will win the pile if the target fails */
  challenger: SeatId;
  /** seat owing flips */
  target: SeatId;
  chancesLeft: number;
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
  /** open slap window — any alive seat may slap until it closes */
  window: { pattern: SlapPattern } | null;
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

function aliveSeats(state: RatscrewState): SeatId[] {
  const alive: SeatId[] = [];
  for (let seat = 0; seat < state.seats; seat++) {
    if ((state.piles[seat]?.length ?? 0) > 0) alive.push(seat);
  }
  return alive;
}

function nextAlive(state: RatscrewState, from: SeatId): SeatId {
  const alive = aliveSeats(state);
  for (let step = 1; step <= state.seats; step++) {
    const seat = (from + step) % state.seats;
    if (alive.includes(seat)) return seat;
  }
  return from;
}

/** Slap-window actor order rotates from the seat after the flipper so no seat owns every race. */
function actorsForWindow(state: RatscrewState): SeatId[] {
  const start = (state.lastFlipper + 1) % state.seats;
  const ordered: SeatId[] = [];
  for (let step = 0; step < state.seats; step++) {
    const seat = (start + step) % state.seats;
    if ((state.piles[seat]?.length ?? 0) > 0) ordered.push(seat);
  }
  return ordered;
}

function phaseFor(state: RatscrewState): PhaseState {
  if (state.window) {
    return { phase: 'slap', actor: null, actors: actorsForWindow(state), round: 1 };
  }
  return { phase: 'flip', actor: state.turn, round: 1 };
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
    if ((state.piles[seat]?.length ?? 0) === 0) return error('empty-pile', 'seat has no cards');
    // A veiled flip only becomes legal once the room has peeled the handle, so
    // a client can never push an unopened card into the public center pile.
    if (isVeilHandle(state.piles[seat]?.[0])) {
      return error('card-still-veiled', 'the flipped card has not been opened yet');
    }
    return true;
  },
  apply(state, seat, _payload, ctx) {
    const pile = state.piles[seat] ?? [];
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
      const targetEmpty = (next.piles[challenge.target]?.length ?? 0) === 0;
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
      return { ...next, window: { pattern }, pendingWin };
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
    if (!state.window) return error('no-window', 'nothing is slappable right now');
    if ((state.piles[seat]?.length ?? 0) === 0) return error('empty-pile', 'out of the game');
    return true;
  },
  apply(state, seat, _payload, ctx) {
    const pattern = state.window?.pattern;
    if (!pattern) throw new Error('slap apply requires an open window');
    ctx.fx.emit('ratscrew.slap', { seat, pattern });
    const collected = collectCenter(
      { ...state, window: null, pendingWin: null, challenge: null },
      seat,
      ctx,
    );
    ctx.fx.emit(Fx.TurnRing, { seat }, 80);
    return { ...collected, turn: seat };
  },
};

/**
 * Closes an open slap window without a winner. Injected by the transport
 * authority after `slapWindowMs`; replay reproduces it bit-for-bit because the
 * injection lands in the log.
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

function legalMovesForSeat(
  state: RatscrewState,
  phase: PhaseState,
  seat: SeatId,
): readonly LegalMove[] {
  if (phase.phase === 'slap') {
    return (phase.actors ?? []).includes(seat) ? [{ id: 'slap' }] : [];
  }
  const hasCards = (state.piles[seat]?.length ?? 0) > 0;
  return phase.actor === seat && hasCards ? [{ id: 'flip' }] : [];
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
    const phase = phaseFor(state);
    const ended = result(state);
    return ended ? { phase, ended } : { phase };
  },
  canInject(_state, phase, moveId) {
    if (moveId !== 'windowClose') {
      return error('injection-refused', `ratscrew does not accept injected ${moveId}`);
    }
    return phase.phase === 'slap' ? true : error('no-window', 'no slap window is open');
  },
};

function result(state: RatscrewState): MatchResult | null {
  const alive = aliveSeats(state);
  if (alive.length > 1) return null;
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
      legal.find((move) => move.id === 'slap') ?? legal.find((move) => move.id === 'flip') ?? null
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
    if (!Number.isInteger(seats) || seats < 2 || seats > 6) {
      throw new Error('ratscrew requires 2–6 seats');
    }
    const shuffled = dealOrder(ctx, RATSCREW_DECK);
    const piles: CardId[][] = Array.from({ length: seats }, () => []);
    for (let index = 0; index < shuffled.length; index++) {
      const card = shuffled[index] as CardId;
      piles[index % seats]!.push(card);
      fx.emit(
        Fx.DealCard,
        { card, from: 'stock', to: `hand:${index % seats}`, dur: 140 },
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
  moves: { flip, slap, windowClose },
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
