import {
  Fx,
  addTo,
  defineConfig,
  dealOrder,
  drawFrom,
  isVeilHandle,
  removeFrom,
  veilSupport,
  type AutoMove,
  type BotPolicy,
  type CardId,
  type ConfigFieldValue,
  type DeckDef,
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
import { wildpileHowToPlay } from './howto';
import {
  WILDPILE_BASE_CARD_IDS,
  WILDPILE_COLORS,
  isWildKind,
  sameWildpileFace,
  wildpileDeck,
  wildpileFace,
  type WildpileColor,
} from './deck';

export interface WildpileRules {
  /** Answer a Draw Two with another Draw Two and pass the pile along. */
  stackDrawTwo: boolean;
  /** Same, for Draw Four. */
  stackDrawFour: boolean;
  /** Slam an exact face match out of turn. */
  jumpIn: boolean;
  /** Keep drawing until something is playable instead of drawing exactly one. */
  drawToMatch: boolean;
  /** A drawn card that can be played must be played. */
  forcePlay: boolean;
  /** Sevens swap hands with a chosen seat; zeroes rotate every hand one seat. */
  sevenZero: boolean;
  /** Deal in the Wild Swap Hands and Wild Shuffle Hands cards. */
  swapCards: boolean;
  /** The seat facing a Draw Four may call it a bluff before picking it up. */
  challengeDrawFour: boolean;
  /** Cards dealt to each seat. */
  handSize: number;
  [key: string]: ConfigFieldValue;
}

export interface WildpileInterrupt {
  resumeTurn: SeatId;
  card: CardId;
  candidates: SeatId[];
}

/**
 * An unresolved Draw Four. A Draw Four is only an honest play when the seat had
 * nothing in the live colour, so the seat facing the pickup may call the bluff:
 * proved right, the accused takes the cards instead; proved wrong, the
 * challenger takes them plus {@link CHALLENGE_PENALTY}.
 */
export interface WildpileChallenge {
  /** Seat that played the Draw Four. */
  accused: SeatId;
  /** The only seat that may challenge — the one facing the pickup. */
  challenger: SeatId;
  /** Colour that was live when the card was played; what makes it a bluff. */
  colorAtPlay: WildpileColor;
  /**
   * The cards in the accused's hand that matched `colorAtPlay` at the moment
   * they played. Empty means the Draw Four was honest and a challenge fails.
   */
  heldMatches: CardId[];
  /** Pickup riding on the answer, before any challenge penalty. */
  amount: number;
}

export interface WildpileState {
  seats: number;
  hands: CardId[][];
  stock: CardId[];
  discard: CardId[];
  turn: SeatId;
  direction: 1 | -1;
  activeColor: WildpileColor | null;
  pendingDraw: number;
  pendingKind: 'draw-two' | 'wild-draw-four' | null;
  awaitingColor: SeatId | null;
  /** Seat that must nominate a hand to swap with (Wild Swap Hands, or a seven). */
  awaitingSwap: SeatId | null;
  interrupt: WildpileInterrupt | null;
  /**
   * Card the seat just drew and may still play. While set the turn stays put:
   * the seat either plays it or passes (unless `forcePlay` removes the choice).
   */
  drawnCard: CardId | null;
  /** Open Draw Four accusation window, or null when nothing is contestable. */
  challenge: WildpileChallenge | null;
  /**
   * Seats that have armed last-card protection while holding two cards. Playing
   * down to one without it costs {@link LAST_CARD_PENALTY}; drawing disarms it.
   */
  calledLastCard: boolean[];
  winner: SeatId | null;
  rules: WildpileRules;
  /**
   * True when the round is dealt under Veil: hands and stock hold opaque
   * handles. A card becomes readable the moment it is played, so ordinary play
   * needs no rule changes — only jump-in does, because the table can no longer
   * tell who is holding a match. See docs/VEILED-DECK-PROTOCOL.md.
   */
  veiled: boolean;
}

/** Cards drawn by a seat that reaches one card without arming protection. */
export const LAST_CARD_PENALTY = 2;

/** Extra cards a seat takes on top of the pickup for a challenge that fails. */
export const CHALLENGE_PENALTY = 2;

/** Presentation offset so a forced pickup lands after the card that caused it. */
const FORCED_DRAW_DELAY_MS = 300;

/** Beat held for the accusation to be read before the cards move. */
const CHALLENGE_REVEAL_MS = 900;

export const wildpileConfig = defineConfig<WildpileRules>(
  [
    {
      key: 'handSize',
      kind: 'int',
      label: 'Cards dealt',
      min: 5,
      max: 10,
      default: 7,
      group: 'The deal',
      help: 'How many cards each seat starts with.',
    },
    {
      key: 'stackDrawTwo',
      kind: 'toggle',
      label: 'Stack Draw Twos',
      default: true,
      group: 'Penalties',
      help: 'Answer a Draw Two with your own and pass the growing pile along.',
    },
    {
      key: 'stackDrawFour',
      kind: 'toggle',
      label: 'Stack Draw Fours',
      default: true,
      group: 'Penalties',
      help: 'Same for Draw Fours. Penalties can climb fast.',
    },
    {
      key: 'jumpIn',
      kind: 'toggle',
      label: 'Jump in',
      default: true,
      advanced: true,
      group: 'House rules',
      help: 'Holding the exact card just played? Slam it down out of turn.',
    },
    {
      key: 'drawToMatch',
      kind: 'toggle',
      label: 'Draw until playable',
      default: false,
      advanced: true,
      group: 'House rules',
      help: 'Keep drawing until something matches instead of drawing one card.',
    },
    {
      key: 'forcePlay',
      kind: 'toggle',
      label: 'Force play',
      default: false,
      advanced: true,
      group: 'House rules',
      help: 'A card you drew that can be played must be played.',
    },
    {
      key: 'sevenZero',
      kind: 'toggle',
      label: 'Sevens and zeroes',
      default: false,
      advanced: true,
      group: 'House rules',
      help: 'Play a 7 to swap hands with someone; play a 0 to pass every hand along.',
    },
    {
      key: 'challengeDrawFour',
      kind: 'toggle',
      label: 'Challenge Draw Fours',
      default: false,
      advanced: true,
      group: 'House rules',
      help: 'A Draw Four is only honest with nothing in the live colour. Call the bluff: win and they take the cards, lose and you take two more.',
    },
    {
      key: 'swapCards',
      kind: 'toggle',
      label: 'Swap-hand wilds',
      default: false,
      advanced: true,
      group: 'The deck',
      help: 'Deal in Wild Swap Hands and Wild Shuffle Hands.',
    },
  ],
  [
    {
      id: 'classic',
      label: 'Classic Wildpile',
      values: { stackDrawTwo: false, stackDrawFour: false, jumpIn: false },
    },
    {
      id: 'party',
      label: 'Party Pile',
      values: { stackDrawTwo: true, stackDrawFour: true, jumpIn: true },
    },
    {
      id: 'houseRules',
      label: 'House Rules',
      values: {
        stackDrawTwo: true,
        stackDrawFour: true,
        jumpIn: true,
        drawToMatch: true,
        forcePlay: true,
        sevenZero: true,
        swapCards: true,
        challengeDrawFour: true,
      },
    },
  ],
);

function isRealCard(card: CardId): boolean {
  return !isVeilHandle(card);
}

/**
 * The swap wilds ship with the deck but only join the shuffle when the table
 * asks for them, so a classic pile stays exactly 108 cards.
 */
function wildpileDealtDeck(config: WildpileRules): DeckDef {
  return config.swapCards ? wildpileDeck : { ...wildpileDeck, cardIds: WILDPILE_BASE_CARD_IDS };
}

function error(code: string, message: string): RuleError {
  return { code, message };
}

function payloadCard(payload: unknown): CardId | null {
  const card = (payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' ? card : null;
}

function payloadColor(payload: unknown): WildpileColor | null {
  const color = (payload as { color?: unknown } | undefined)?.color;
  return WILDPILE_COLORS.includes(color as WildpileColor) ? (color as WildpileColor) : null;
}

function payloadSeat(payload: unknown): SeatId | null {
  const seat = (payload as { seat?: unknown } | undefined)?.seat;
  return typeof seat === 'number' && Number.isInteger(seat) ? seat : null;
}

function hand(state: WildpileState, seat: SeatId): CardId[] {
  return state.hands[seat] ?? [];
}

function nextSeat(state: WildpileState, from: SeatId, steps = 1): SeatId {
  return (from + state.direction * steps + state.seats * steps) % state.seats;
}

function topCard(state: WildpileState): CardId {
  const card = state.discard[0];
  if (!card) throw new Error('wildpile discard cannot be empty');
  return card;
}

function canStack(state: WildpileState, card: CardId): boolean {
  const kind = wildpileFace(card).meta.kind;
  if (state.pendingKind === null || kind !== state.pendingKind) return false;
  if (kind === 'draw-two') return state.rules.stackDrawTwo;
  if (kind === 'wild-draw-four') return state.rules.stackDrawFour;
  return false;
}

function canPlay(state: WildpileState, card: CardId): boolean {
  const face = wildpileFace(card);
  if (state.pendingDraw > 0) return canStack(state, card);
  if (isWildKind(face.meta.kind)) return true;
  if (face.color === state.activeColor) return true;
  const top = wildpileFace(topCard(state));
  if (face.meta.kind === 'number' && top.meta.kind === 'number') {
    return face.meta.value === top.meta.value;
  }
  return face.meta.kind === top.meta.kind;
}

/** Sevens swap with one seat; zeroes pass every hand along. Both are opt-in. */
function sevenZeroEffect(state: WildpileState, card: CardId): 'swap' | 'rotate' | null {
  if (!state.rules.sevenZero) return null;
  const meta = wildpileFace(card).meta;
  if (meta.kind !== 'number') return null;
  if (meta.value === 7) return 'swap';
  if (meta.value === 0) return 'rotate';
  return null;
}

/** Every hand moves one seat in the direction of play. */
function rotateHands(state: WildpileState, ctx: MoveCtx): WildpileState {
  const hands = state.hands.map((_, seat) => {
    // The seat that *gives* to `seat` is one step against the play direction.
    const from = (seat - state.direction + state.seats) % state.seats;
    return (state.hands[from] ?? []).slice();
  });
  ctx.fx.emit('wildpile.rotate', { direction: state.direction });
  return { ...state, hands, calledLastCard: state.calledLastCard.map(() => false) };
}

function swapHands(state: WildpileState, a: SeatId, b: SeatId, ctx: MoveCtx): WildpileState {
  const hands = state.hands.map((cards, seat) => {
    if (seat === a) return (state.hands[b] ?? []).slice();
    if (seat === b) return (state.hands[a] ?? []).slice();
    return cards.slice();
  });
  ctx.fx.emit('wildpile.swap', { seat: a, target: b });
  return {
    ...state,
    hands,
    calledLastCard: state.calledLastCard.map((armed, seat) =>
      seat === a || seat === b ? false : armed,
    ),
  };
}

/** Pool every hand, shuffle, and redeal round-robin from the next seat. */
function shuffleHands(state: WildpileState, from: SeatId, ctx: MoveCtx): WildpileState {
  const pool = ctx.rng.shuffle(state.hands.flat());
  const hands: CardId[][] = Array.from({ length: state.seats }, () => []);
  pool.forEach((card, index) => {
    const seat = nextSeat(state, from, index + 1);
    hands[seat]?.push(card);
  });
  ctx.fx.emit('wildpile.shuffle-hands', { seat: from });
  return { ...state, hands, calledLastCard: state.calledLastCard.map(() => false) };
}

/**
 * Records what the seat was holding when they played a Draw Four, so the
 * accusation can be settled later without re-deriving history.
 *
 * Only a card in the *live colour* makes the play a bluff: other wilds, and
 * matching numbers or symbols in other colours, are not alternatives the rule
 * cares about. Returns null when the table has the rule off, when there is no
 * live colour to have matched, or under Veil — a veiled room holds opaque
 * handles, so nothing can answer the question without opening the whole hand.
 */
function openChallenge(
  state: WildpileState,
  accused: SeatId,
  handAtPlay: readonly CardId[],
  amount: number,
): WildpileChallenge | null {
  if (!state.rules.challengeDrawFour || state.veiled) return null;
  const colorAtPlay = state.activeColor;
  if (!colorAtPlay) return null;
  return {
    accused,
    challenger: nextSeat(state, accused),
    colorAtPlay,
    heldMatches: handAtPlay.filter((held) => wildpileFace(held).color === colorAtPlay),
    amount,
  };
}

/** The seat on the clock may call the Draw Four they are staring at a bluff. */
function canChallenge(state: WildpileState, seat: SeatId): boolean {
  return (
    state.challenge !== null &&
    state.challenge.challenger === seat &&
    state.pendingDraw > 0 &&
    state.awaitingColor === null
  );
}

function exactJumpCards(state: WildpileState, seat: SeatId): CardId[] {
  const target = state.interrupt?.card;
  if (!target) return [];
  return hand(state, seat).filter((card) => sameWildpileFace(card, target));
}

function phaseFor(state: WildpileState) {
  if (state.winner !== null) return { phase: 'ended', actor: null, round: 1 };
  if (state.awaitingColor !== null) {
    return { phase: 'choose-color', actor: state.awaitingColor, round: 1 };
  }
  if (state.awaitingSwap !== null) {
    return { phase: 'choose-target', actor: state.awaitingSwap, round: 1 };
  }
  const interrupter = state.interrupt?.candidates[0];
  if (interrupter !== undefined) return { phase: 'interrupt', actor: interrupter, round: 1 };
  return { phase: 'play', actor: state.turn, round: 1 };
}

/**
 * Seats that may jump in on `card`, polled in the *current* play direction so a
 * reverse re-orders the queue it just created. Seats the card passed over are
 * excluded: a skip that the skipped seat can jump back into is not a skip.
 */
function jumpCandidates(
  state: WildpileState,
  card: CardId,
  playingSeat: SeatId,
  passedOver: readonly SeatId[],
): SeatId[] {
  if (!state.rules.jumpIn) return [];
  const kind = wildpileFace(card).meta.kind;
  if (isWildKind(kind)) return [];
  const candidates: SeatId[] = [];
  for (let offset = 1; offset < state.seats; offset++) {
    const seat = nextSeat(state, playingSeat, offset);
    if (passedOver.includes(seat)) continue;
    // Under Veil the table cannot tell who is holding a match, so the window
    // opens to everyone and each seat answers for itself: play the exact match
    // (which opens the card) or decline. Clients auto-decline when their own
    // resolved hand has nothing, so this costs a round trip, not a prompt.
    if (state.veiled || hand(state, seat).some((held) => sameWildpileFace(held, card))) {
      candidates.push(seat);
    }
  }
  return candidates;
}

function withInterrupt(
  state: WildpileState,
  card: CardId,
  playingSeat: SeatId,
  resumeTurn: SeatId,
  passedOver: readonly SeatId[],
): WildpileState {
  const candidates = jumpCandidates(state, card, playingSeat, passedOver);
  return {
    ...state,
    turn: candidates.length > 0 ? (candidates[0] as SeatId) : resumeTurn,
    interrupt: candidates.length > 0 ? { resumeTurn, card, candidates } : null,
  };
}

function validatePlayable(state: WildpileState, seat: SeatId, payload: unknown): true | RuleError {
  const card = payloadCard(payload);
  if (!card) return error('bad-payload', 'expected {card}');
  if (!hand(state, seat).includes(card)) return error('not-in-hand', `${card} is not in the hand`);
  if (state.awaitingColor !== null) return error('color-required', 'choose a color first');
  if (state.awaitingSwap !== null) return error('target-required', 'choose a hand first');
  // A card just drawn is the only thing that seat may play this turn.
  if (state.drawnCard !== null && state.turn === seat && card !== state.drawnCard) {
    return error('play-the-drawn-card', 'only the card you drew can be played now');
  }

  if (state.interrupt) {
    if (state.interrupt.candidates[0] !== seat)
      return error('not-interrupter', 'seat cannot jump in');
    return exactJumpCards(state, seat).includes(card)
      ? true
      : error('not-exact-match', 'jump-in requires an exact face match');
  }

  if (state.turn !== seat) return error('not-your-turn', 'seat is not taking this turn');
  return canPlay(state, card) ? true : error('card-not-playable', `${card} cannot be played`);
}

function playResolved(
  state: WildpileState,
  seat: SeatId,
  card: CardId,
  ctx: MoveCtx,
): WildpileState {
  const face = wildpileFace(card);
  const hands = state.hands.map((cards, index) =>
    index === seat ? removeFrom(cards, card) : cards.slice(),
  );
  ctx.fx.emit(Fx.DiscardCard, { card, seat, to: 'discard' });

  const reachedLastCard = hands[seat]?.length === 1;
  const protectedSeat = state.calledLastCard[seat] ?? false;
  if (reachedLastCard && protectedSeat) ctx.fx.emit('wildpile.last-card', { seat });

  let next: WildpileState = {
    ...state,
    hands,
    discard: addTo(state.discard, card),
    activeColor: face.color ?? null,
    interrupt: null,
    drawnCard: null,
    // Any open accusation dies with the card that answers it; a fresh Draw Four
    // below opens its own.
    challenge: null,
    calledLastCard: state.calledLastCard.map((armed, index) => (index === seat ? false : armed)),
    winner: hands[seat]?.length === 0 ? seat : null,
  };

  // Caught short: reaching one card unprotected costs two, before anything else
  // reads the hand (so jump-in candidacy and card counts stay consistent).
  if (reachedLastCard && !protectedSeat) {
    ctx.fx.emit('wildpile.caught', { seat, amount: LAST_CARD_PENALTY }, FORCED_DRAW_DELAY_MS);
    next = drawCards(next, seat, LAST_CARD_PENALTY, ctx, {
      delayMs: FORCED_DRAW_DELAY_MS,
      announce: 'caught',
    });
  }

  if (isWildKind(face.meta.kind)) {
    if (face.meta.kind === 'wild-draw-four') {
      next = {
        ...next,
        pendingDraw: state.pendingDraw + 4,
        pendingKind: 'wild-draw-four',
        // `hands` is the hand as it stood when the card left it, before any
        // last-card penalty topped it back up — that is what was bluffed with.
        challenge: openChallenge(state, seat, hands[seat] ?? [], state.pendingDraw + 4),
      };
      ctx.fx.emit('wildpile.draw-stack', { seat, amount: next.pendingDraw });
    }
    // A hand already emptied has won; redealing into it would un-win the match.
    if (face.meta.kind === 'wild-shuffle' && next.winner === null) {
      next = shuffleHands(next, seat, ctx);
    }
    ctx.fx.emit('wildpile.wild', { card, seat });
    // Every wild picks a color first; Swap Hands then nominates a hand.
    return next.winner === null ? { ...next, awaitingColor: seat, turn: seat } : next;
  }

  const sevenZero = next.winner === null ? sevenZeroEffect(next, card) : null;
  if (sevenZero === 'rotate') next = rotateHands(next, ctx);

  let steps = 1;
  if (face.meta.kind === 'skip') {
    steps = 2;
  } else if (face.meta.kind === 'reverse') {
    next = { ...next, direction: state.direction === 1 ? -1 : 1 };
    // Head-to-head has no ring to turn around, so a reverse lands as a skip.
    steps = state.seats === 2 ? 2 : 1;
    ctx.fx.emit('wildpile.reverse', { direction: next.direction, seat });
  } else if (face.meta.kind === 'draw-two') {
    next = {
      ...next,
      pendingDraw: state.pendingDraw + 2,
      pendingKind: 'draw-two',
    };
    ctx.fx.emit('wildpile.draw-stack', { seat, amount: next.pendingDraw });
  }

  // Seats the card stepped over. They lose the turn *and* the jump-in window,
  // otherwise the skipped seat could simply jump back in and undo the card.
  const passedOver: SeatId[] = [];
  for (let offset = 1; offset < steps; offset++) passedOver.push(nextSeat(next, seat, offset));
  if (face.meta.kind === 'skip') {
    ctx.fx.emit('wildpile.skip', { seat: passedOver[0] ?? seat });
  }

  const resumeTurn = nextSeat(next, seat, steps);
  if (next.winner !== null) return { ...next, turn: resumeTurn };

  if (sevenZero === 'swap') {
    // Head-to-head there is only one hand to take, so skip the pointless prompt.
    if (next.seats === 2) {
      next = swapHands(next, seat, nextSeat(next, seat), ctx);
      ctx.fx.emit(Fx.TurnRing, { seat: resumeTurn }, 80);
      return { ...next, turn: resumeTurn };
    }
    return { ...next, awaitingSwap: seat, turn: seat };
  }

  const interrupted = withInterrupt(next, card, seat, resumeTurn, passedOver);
  ctx.fx.emit(Fx.TurnRing, { seat: interrupted.turn }, 80);
  return interrupted;
}

const playCard: Move<WildpileState> = {
  validate: validatePlayable,
  apply(state, seat, payload, ctx) {
    const card = payloadCard(payload);
    if (!card) throw new Error('playCard apply requires a card');
    return playResolved(state, seat, card, ctx);
  },
};

function replenish(state: WildpileState, ctx: MoveCtx): WildpileState {
  if (state.stock.length > 0 || state.discard.length <= 1) return state;
  const [top, ...recyclable] = state.discard;
  ctx.fx.emit(Fx.ShuffleStock, {});
  return {
    ...state,
    stock: ctx.recycle ? [...ctx.recycle.issue] : ctx.rng.shuffle(recyclable),
    discard: top ? [top] : [],
  };
}

/** Why a seat is picking up, for the table's running pickup counter. */
export type WildpilePickupReason = 'penalty' | 'caught' | 'challenge';

/**
 * Longest window a pickup is allowed to occupy. A stacked +12 that dealt itself
 * out at a fixed pace would stall the table, so the stagger compresses instead.
 */
const PICKUP_SPAN_MAX_MS = 1100;

/** Gap between cards in a short pickup, before the span cap kicks in. */
const PICKUP_STEP_MS = 150;

interface DrawOptions {
  delayMs?: number;
  /** Ends the draw as soon as a taken card satisfies it (draw-until-playable). */
  stopWhen?: (card: CardId) => boolean;
  /**
   * Announces the pickup as a single event the table can count against. Set for
   * anything the seat did not choose — the moments that need to be read, not
   * just seen.
   */
  announce?: WildpilePickupReason;
}

function drawCards(
  state: WildpileState,
  seat: SeatId,
  count: number,
  ctx: MoveCtx,
  options: DrawOptions = {},
): WildpileState {
  const delayMs = options.delayMs ?? 0;
  let next = state;
  const drawn: CardId[] = [];
  while (drawn.length < count) {
    next = replenish(next, ctx);
    if (next.stock.length === 0) break;
    const take = drawFrom(next.stock, 1);
    const card = take.drawn[0];
    if (!card) break;
    drawn.push(card);
    next = { ...next, stock: take.rest };
    if (options.stopWhen?.(card)) break;
  }

  // Cards arrive one at a time so a big pickup reads as it lands, rather than
  // appearing in the hand all at once.
  const gaps = Math.max(1, drawn.length - 1);
  const step = Math.min(PICKUP_STEP_MS, PICKUP_SPAN_MAX_MS / gaps);
  if (options.announce && drawn.length > 0) {
    ctx.fx.emit(
      'wildpile.pickup',
      { seat, amount: drawn.length, reason: options.announce, stepMs: step },
      delayMs,
    );
  }
  drawn.forEach((card, index) =>
    ctx.fx.emit(Fx.DrawCard, { card, seat, from: 'stock' }, delayMs + index * step),
  );
  return {
    ...next,
    hands: next.hands.map((cards, index) => (index === seat ? [...cards, ...drawn] : cards)),
    // A hand that grew is no longer one card from out: protection must be re-armed.
    calledLastCard: next.calledLastCard.map((armed, index) => (index === seat ? false : armed)),
  };
}

const draw: Move<WildpileState> = {
  validate(state, seat, _payload, ctx) {
    if (state.interrupt || state.awaitingColor !== null || state.awaitingSwap !== null) {
      return error('draw-unavailable', 'draw is unavailable during this decision');
    }
    if (state.drawnCard !== null) return error('already-drew', 'play the card you drew or pass');
    // Recycling a face-up discard into the stock would make every remaining
    // draw readable by the whole table, so a veiled room has to re-veil it
    // through a fresh shuffle ceremony first.
    if (
      state.veiled &&
      state.stock.length === 0 &&
      state.discard.slice(1).some(isRealCard) &&
      !ctx?.recycle
    ) {
      return error(
        'stock-not-reveiled',
        'the discard pile must be re-veiled before it becomes the stock',
      );
    }
    return state.turn === seat ? true : error('not-your-turn', 'seat is not taking this turn');
  },
  apply(state, seat, _payload, ctx) {
    const forced = state.pendingDraw > 0;
    // Draw-until-playable is bounded by the cards in play, so a pile nothing
    // matches still terminates instead of spinning.
    const ceiling = state.stock.length + state.discard.length;
    const count = forced ? state.pendingDraw : state.rules.drawToMatch ? Math.max(1, ceiling) : 1;
    // A forced pickup trails the card that caused it; a voluntary draw is instant.
    const drawn = drawCards(state, seat, count, ctx, {
      delayMs: forced ? FORCED_DRAW_DELAY_MS : 0,
      stopWhen: forced ? undefined : (card) => canPlay(state, card),
      // A pickup the seat did not choose is the one worth counting out loud.
      announce: forced ? 'penalty' : undefined,
    });
    const settled: WildpileState = {
      ...drawn,
      pendingDraw: 0,
      pendingKind: null,
      interrupt: null,
      drawnCard: null,
      // Taking the pickup is how a seat accepts a Draw Four: window closed.
      challenge: null,
    };

    // A pickup is a lost turn. A voluntary draw that lands something playable
    // keeps the turn: standard play lets you use the card you just drew.
    const taken = hand(settled, seat).at(-1) ?? null;
    if (!forced && taken !== null && canPlay(settled, taken)) {
      ctx.fx.emit('wildpile.drew-playable', { seat, card: taken });
      return { ...settled, drawnCard: taken };
    }

    const turn = nextSeat(settled, seat);
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, 80);
    return { ...settled, turn };
  },
};

/** Decline the card you just drew. Unavailable when the table forces the play. */
const pass: Move<WildpileState> = {
  validate(state, seat) {
    if (state.drawnCard === null) return error('nothing-to-pass', 'no drawn card is pending');
    if (state.turn !== seat) return error('not-your-turn', 'seat is not taking this turn');
    return state.rules.forcePlay && canPlay(state, state.drawnCard)
      ? error('force-play', 'the table requires you to play that card')
      : true;
  },
  apply(state, seat, _payload, ctx) {
    const turn = nextSeat(state, seat);
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, 80);
    return { ...state, drawnCard: null, turn };
  },
};

/**
 * Call a Draw Four a bluff. The accused had to be empty of the live colour for
 * the play to be honest; whoever is wrong takes the pile.
 */
const challengeDrawFour: Move<WildpileState> = {
  validate(state, seat) {
    if (!state.rules.challengeDrawFour) {
      return error('challenge-off', 'this table does not allow Draw Four challenges');
    }
    if (state.challenge === null) return error('nothing-to-challenge', 'no Draw Four is pending');
    if (state.challenge.challenger !== seat) {
      return error('not-the-challenger', 'only the seat facing the pickup may challenge');
    }
    return canChallenge(state, seat)
      ? true
      : error('challenge-closed', 'the challenge window has passed');
  },
  apply(state, seat, _payload, ctx) {
    const challenge = state.challenge;
    if (!challenge) throw new Error('challengeDrawFour apply requires an open challenge');

    const upheld = challenge.heldMatches.length > 0;
    // The proof is public: an accusation that lands should be seen to land.
    ctx.fx.emit('wildpile.challenge', {
      challenger: seat,
      accused: challenge.accused,
      upheld,
      color: challenge.colorAtPlay,
      amount: upheld ? challenge.amount : challenge.amount + CHALLENGE_PENALTY,
      proof: challenge.heldMatches,
    });

    const loser = upheld ? challenge.accused : seat;
    const amount = upheld ? challenge.amount : challenge.amount + CHALLENGE_PENALTY;
    const settled = drawCards(state, loser, amount, ctx, {
      delayMs: CHALLENGE_REVEAL_MS,
      announce: 'challenge',
    });
    const cleared: WildpileState = {
      ...settled,
      pendingDraw: 0,
      pendingKind: null,
      challenge: null,
    };

    // Right: the pile lands on the bluffer and the challenger still has a turn.
    // Wrong: the challenger has picked up and forfeits it.
    const turn = upheld ? seat : nextSeat(cleared, seat);
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, CHALLENGE_REVEAL_MS + 80);
    return { ...cleared, turn };
  },
};

/**
 * Last-card protection. Arm it while holding two — the seat that plays down to
 * one without it is caught and draws {@link LAST_CARD_PENALTY}.
 */
const callLastCard: Move<WildpileState> = {
  validate(state, seat) {
    if (state.calledLastCard[seat]) return error('already-called', 'protection is already armed');
    return hand(state, seat).length === 2
      ? true
      : error('not-last-card', 'protection arms only on the second-to-last card');
  },
  apply(state, seat, _payload, ctx) {
    ctx.fx.emit('wildpile.last-card-armed', { seat });
    return {
      ...state,
      calledLastCard: state.calledLastCard.map((armed, index) => (index === seat ? true : armed)),
    };
  },
};

const chooseColor: Move<WildpileState> = {
  validate(state, seat, payload) {
    if (state.awaitingColor !== seat)
      return error('color-not-awaited', 'seat is not choosing color');
    return payloadColor(payload) ? true : error('bad-color', 'expected a Wildpile color');
  },
  apply(state, seat, payload, ctx) {
    const color = payloadColor(payload);
    if (!color) throw new Error('chooseColor apply requires a color');
    ctx.fx.emit('wildpile.color', { seat, color });
    const colored: WildpileState = { ...state, activeColor: color, awaitingColor: null };

    // Wild Swap Hands calls a color and then a hand.
    if (wildpileFace(topCard(state)).meta.kind === 'wild-swap') {
      if (colored.seats === 2) {
        const target = nextSeat(colored, seat);
        const swapped = swapHands(colored, seat, target, ctx);
        const turn = nextSeat(swapped, seat);
        ctx.fx.emit(Fx.TurnRing, { seat: turn }, 80);
        return { ...swapped, turn };
      }
      return { ...colored, awaitingSwap: seat, turn: seat };
    }

    const turn = nextSeat(colored, seat);
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, 80);
    return { ...colored, turn };
  },
};

/** Nominates the hand to take — Wild Swap Hands, or a seven under 7-0. */
const chooseTarget: Move<WildpileState> = {
  validate(state, seat, payload) {
    if (state.awaitingSwap !== seat)
      return error('swap-not-awaited', 'seat is not choosing a hand');
    const target = payloadSeat(payload);
    if (target === null || target < 0 || target >= state.seats) {
      return error('bad-target', 'expected a seated opponent');
    }
    return target === seat ? error('bad-target', 'pick another seat') : true;
  },
  apply(state, seat, payload, ctx) {
    const target = payloadSeat(payload);
    if (target === null) throw new Error('chooseTarget apply requires a seat');
    const swapped = swapHands(state, seat, target, ctx);
    const turn = nextSeat(swapped, seat);
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, 80);
    return { ...swapped, awaitingSwap: null, turn };
  },
};

const declineJump: Move<WildpileState> = {
  validate(state, seat) {
    return state.interrupt?.candidates[0] === seat
      ? true
      : error('not-interrupter', 'seat has no jump-in decision');
  },
  apply(state, _seat, _payload, ctx) {
    if (!state.interrupt) throw new Error('declineJump apply requires an interrupt');
    const candidates = state.interrupt.candidates.slice(1);
    const turn = candidates[0] ?? state.interrupt.resumeTurn;
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, 40);
    return {
      ...state,
      turn,
      interrupt: candidates.length > 0 ? { ...state.interrupt, candidates } : null,
    };
  },
};

/** Offered alongside the seat's real options — arming never costs the turn. */
function lastCardMoves(state: WildpileState, seat: SeatId): LegalMove[] {
  return hand(state, seat).length === 2 && !state.calledLastCard[seat]
    ? [{ id: 'callLastCard', hint: 'protect your last card' }]
    : [];
}

function legalMoves(state: WildpileState): LegalMove[] {
  if (state.winner !== null) return [];
  if (state.awaitingColor !== null) {
    return WILDPILE_COLORS.map((color) => ({ id: 'chooseColor', payload: { color } }));
  }
  if (state.awaitingSwap !== null) {
    const chooser = state.awaitingSwap;
    return state.hands
      .map((_, seat) => seat)
      .filter((seat) => seat !== chooser)
      .map((seat) => ({ id: 'chooseTarget', payload: { seat } }));
  }
  if (state.interrupt) {
    const actor = state.interrupt.candidates[0];
    if (actor === undefined) return [];
    return [
      ...exactJumpCards(state, actor).map((card) => ({ id: 'playCard', payload: { card } })),
      ...lastCardMoves(state, actor),
      { id: 'declineJump' },
    ];
  }
  // Mid-turn after a draw: the drawn card is the only card on offer.
  if (state.drawnCard !== null) {
    const playable = canPlay(state, state.drawnCard);
    return [
      ...(playable ? [{ id: 'playCard', payload: { card: state.drawnCard } }] : []),
      ...lastCardMoves(state, state.turn),
      ...(playable && state.rules.forcePlay ? [] : [{ id: 'pass' }]),
    ];
  }
  return [
    ...hand(state, state.turn)
      .filter((card) => canPlay(state, card))
      .map((card) => ({ id: 'playCard', payload: { card } })),
    ...lastCardMoves(state, state.turn),
    ...(canChallenge(state, state.turn)
      ? [{ id: 'challengeDrawFour', hint: 'call the bluff' }]
      : []),
    { id: 'draw' },
  ];
}

/**
 * A pending pickup with nothing to stack on it is not a decision, so the flow
 * takes it for the seat instead of parking the table behind a draw button. An
 * open accusation *is* a decision, so the window is left for the seat to close.
 */
function forcedPickup(state: WildpileState, phase: PhaseState): AutoMove | null {
  if (phase.phase !== 'play' || phase.actor === null) return null;
  if (state.pendingDraw <= 0 || state.drawnCard !== null) return null;
  if (canChallenge(state, phase.actor)) return null;
  if (hand(state, phase.actor).some((card) => canStack(state, card))) return null;
  return { seat: phase.actor, move: 'draw', reason: 'forced-pickup' };
}

function result(state: WildpileState): MatchResult | null {
  if (state.winner === null) return null;
  const rankings = state.hands
    .map((cards, seat) => ({ seat, cards: cards.length }))
    .sort((a, b) => a.cards - b.cards || a.seat - b.seat)
    .map((entry, index) => ({
      seat: entry.seat,
      rank: entry.seat === state.winner ? 1 : index + 1,
      detail: { cards: entry.cards },
    }));
  return { winner: state.winner, rankings, reason: 'hand-emptied' };
}

const flow: Flow<WildpileState> = {
  start(state) {
    return phaseFor(state);
  },
  legalMoves(state) {
    return legalMoves(state);
  },
  advance(state) {
    const phase = phaseFor(state);
    const ended = result(state);
    if (ended) return { phase, ended };
    const auto = forcedPickup(state, phase);
    return auto ? { phase, autoMoves: [auto] } : { phase };
  },
};

function preferredColor(state: WildpileState, seat: SeatId): WildpileColor {
  const counts = new Map<WildpileColor, number>(WILDPILE_COLORS.map((color) => [color, 0]));
  for (const card of hand(state, seat)) {
    const color = wildpileFace(card).color;
    if (color) counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return WILDPILE_COLORS.reduce((best, color) =>
    (counts.get(color) ?? 0) > (counts.get(best) ?? 0) ? color : best,
  );
}

/** Bots forget their protection this often, so the penalty is visible in play. */
const BOT_LAST_CARD_SLIP_IN = 6;

/**
 * A bot cannot see the accused's hand, so it plays the odds the way a person
 * does: the more cards someone is holding, the likelier one of them was in the
 * live colour. Capped well under certainty — a bot that always challenges would
 * make the bluff worthless.
 */
function botChallengeChance(state: WildpileState, accused: SeatId): number {
  return Math.min(60, hand(state, accused).length * 8);
}

const bot: BotPolicy<WildpileState> = {
  id: 'wildpile-house-bot',
  label: 'House Bot',
  tier: 2,
  chooseMove(state, seat, legal, rng) {
    const color = preferredColor(state, seat);
    const colorMove = legal.find(
      (move) =>
        move.id === 'chooseColor' &&
        (move.payload as { color?: unknown } | undefined)?.color === color,
    );
    if (colorMove) return colorMove;
    // Arming is free and never ends the turn, so take it first — but slip
    // occasionally so players see the rule bite someone other than themselves.
    const callMove = legal.find((move) => move.id === 'callLastCard');
    if (callMove && rng.int(BOT_LAST_CARD_SLIP_IN) > 0) return callMove;
    // Stacking beats accusing when both are available: it costs nothing and
    // hands the whole problem to the next seat.
    const challengeMove = legal.find((move) => move.id === 'challengeDrawFour');
    if (challengeMove && !legal.some((move) => move.id === 'playCard')) {
      const accused = state.challenge?.accused;
      if (accused !== undefined && rng.int(100) < botChallengeChance(state, accused)) {
        return challengeMove;
      }
    }
    // Take the fattest hand on the table when a swap is on offer.
    const swapMoves = legal.filter((move) => move.id === 'chooseTarget');
    if (swapMoves.length > 0) {
      return swapMoves.reduce((best, move) => {
        const size = (target: LegalMove) => hand(state, payloadSeat(target.payload) ?? seat).length;
        return size(move) > size(best) ? move : best;
      });
    }
    return (
      legal.find((move) => move.id === 'playCard') ??
      legal.find((move) => move.id === 'declineJump') ??
      legal.find((move) => move.id === 'draw') ??
      legal.find((move) => move.id === 'pass') ??
      legal[0] ??
      null
    );
  },
};

export const wildpileGame: GameDef<WildpileState, WildpileRules> = {
  id: 'wildpile',
  howToPlay: wildpileHowToPlay,
  configSchema: wildpileConfig,
  // Veil, inherited: hands are dealt face down, then the room keeps opening
  // cards in public until it turns up a number to start the pile on.
  veil: veilSupport({
    deck: (config) => wildpileDealtDeck(config as WildpileRules),
    handSize: (config) => (config as WildpileRules).handSize,
    publicSetup: (opened) => opened.some((card) => wildpileFace(card).meta.kind === 'number'),
  }),
  setup(ctx) {
    const { config, seats, fx } = ctx;
    if (!Number.isInteger(seats) || seats < 2 || seats > 4) {
      throw new Error('wildpile requires 2–4 seats');
    }
    const shuffled = dealOrder(ctx, wildpileDealtDeck(config));
    const hands: CardId[][] = Array.from({ length: seats }, () => []);
    let cursor = 0;
    for (let round = 0; round < config.handSize; round++) {
      for (let seat = 0; seat < seats; seat++) {
        const card = shuffled[cursor++];
        if (!card) throw new Error('wildpile deck exhausted during deal');
        hands[seat]?.push(card);
        fx.emit(
          Fx.DealCard,
          { card, from: 'stock', to: `hand:${seat}`, dur: 220 },
          (cursor - 1) * 70,
        );
      }
    }
    const starterIndex = shuffled.findIndex(
      (card, index) => index >= cursor && wildpileFace(card).meta.kind === 'number',
    );
    if (starterIndex < 0) throw new Error('wildpile deck has no numeric starter');
    const starter = shuffled[starterIndex] as CardId;
    const stock = shuffled.slice(cursor);
    stock.splice(starterIndex - cursor, 1);
    fx.emit(Fx.FlipCard, { card: starter, to: 'discard' }, cursor * 70);
    return {
      seats,
      hands,
      stock,
      discard: [starter],
      turn: 0,
      direction: 1,
      activeColor: wildpileFace(starter).color ?? null,
      pendingDraw: 0,
      pendingKind: null,
      awaitingColor: null,
      awaitingSwap: null,
      interrupt: null,
      drawnCard: null,
      challenge: null,
      calledLastCard: Array.from({ length: seats }, () => false),
      winner: null,
      rules: config,
      veiled: ctx.veiled === true,
    };
  },
  moves: {
    playCard,
    draw,
    pass,
    chooseColor,
    chooseTarget,
    declineJump,
    callLastCard,
    challengeDrawFour,
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
  end: result,
  bots: [bot],
};
