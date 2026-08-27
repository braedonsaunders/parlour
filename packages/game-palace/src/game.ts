import {
  Fx,
  VEILED_REDEAL_PENDING,
  isVeilHandle,
  isVeiledDealPayload,
  type BotPolicy,
  type CardId,
  type Flow,
  type GameDef,
  type LegalMove,
  type MatchResult,
  type MatchResultRank,
  type Move,
  type MoveCtx,
  type PhaseState,
  type RuleError,
  type SeatId,
  type SetupCtx,
  type VeilSupport,
} from '@parlour/engine';
import {
  BLIND_RANK,
  BURN_RANK,
  FOUR_KIND_COUNT,
  PALACE_DECK,
  RESET_RANK,
  orderOf,
  tryOrder,
} from './cards';
import { palaceConfig, type PalaceRules } from './config';
import { palaceHowToPlay } from './howto';
import {
  DOWN_SIZE,
  MAX_SEATS,
  MIN_SEATS,
  UP_SIZE,
  activeLayer,
  addToHand,
  allEmpty,
  cardCount,
  computeStarter,
  dealRound,
  downOf,
  extendRun,
  handOf,
  heldOnce,
  isAlwaysPlayable,
  isPlayable,
  nextSeat,
  publicSetupFrom,
  publicSetupSize,
  removeFrom,
  upOf,
} from './round';
import type { PalaceState, TopRun } from './state';
import { palaceBots } from './bots';

export const GAME_ID = 'palace';
export { MAX_SEATS, MIN_SEATS };

export {
  DEFAULT_WINS_TO,
  MAX_WINS_TO,
  MIN_WINS_TO,
  palaceConfig,
  type PalaceRules,
} from './config';
export type { PalaceState, TopRun } from './state';
export { PALACE_DECK, orderOf } from './cards';

/** Namespaced fx accents — audio maps live in apps/web/src/lib/audio/game-cues.ts. */
export const PalaceFx = {
  Play: 'palace.play', // {seat, count, rank, source:'hand'|'up'|'down'}
  Burn: 'palace.burn', // {seat, count, reason:'ten'|'four-kind'}
  Pickup: 'palace.pickup', // {seat, count, reason:'chosen'|'down-miss'}
  FlipDown: 'palace.flipDown', // {seat, card, slot}
  Swap: 'palace.swap', // {seat, count}
  Ready: 'palace.ready', // {seat}
  Out: 'palace.out', // {seat, place, round}
} as const;

const PLAY_STAGGER_MS = 40;

function error(code: string, message: string): RuleError {
  return { code, message };
}

// ---------------------------------------------------------------------------
// Round lifecycle
// ---------------------------------------------------------------------------

interface RoundCtx extends MoveCtx {
  deckOrder?: readonly CardId[];
}

function openRound(state: PalaceState, ctx: RoundCtx): PalaceState {
  const { hands, up, down } = dealRound({
    seats: state.seats,
    rng: ctx.rng,
    fx: ctx.fx,
    deckOrder: ctx.deckOrder,
  });
  let next: PalaceState = {
    ...state,
    round: state.round + 1,
    hands,
    up,
    down,
    pile: [],
    burn: [],
    floor: null,
    topRun: null,
    swapped: [],
    readied: [],
    roundWinner: null,
    turn: null,
  };
  if (!next.rules.allowSwap) {
    const starter = computeStarter(next, ctx.rng);
    ctx.fx.emit(Fx.TurnRing, { seat: starter }, 80);
    next = { ...next, turn: starter };
  }
  return next;
}

/** Ranks the seats still holding cards once the round has a winner. */
function closeRound(state: PalaceState, winner: SeatId, ctx: MoveCtx): PalaceState {
  const others: SeatId[] = [];
  for (let seat = 0; seat < state.seats; seat++) if (seat !== winner) others.push(seat);
  others.sort((a, b) => {
    const totalDiff = cardCount(state, a) - cardCount(state, b);
    if (totalDiff !== 0) return totalDiff;
    const downDiff = downOf(state, a).length - downOf(state, b).length;
    if (downDiff !== 0) return downDiff;
    return a - b;
  });
  const roundsWon = state.roundsWon.map((wins, seat) => (seat === winner ? wins + 1 : wins));
  ctx.fx.emit(PalaceFx.Out, { seat: winner, place: 1, round: state.round + 1 });
  return {
    ...state,
    roundsWon,
    roundWinner: winner,
    lastOrder: [winner, ...others],
    turn: null,
  };
}

/**
 * Lands `cards` on the pile from `layer` and resolves specials: burn, reset,
 * blind, four-kind, and — if the seat just emptied every zone — the round win.
 * `layer === 'down'` assumes the caller has already removed the flipped card
 * from `state.down`.
 */
function resolvePlay(
  state: PalaceState,
  seat: SeatId,
  cards: readonly CardId[],
  layer: 'hand' | 'up' | 'down',
  ctx: MoveCtx,
): PalaceState {
  const rank = orderOf(cards[0]!);
  const hands =
    layer === 'hand' ? removeFrom(state.hands, seat, cards) : state.hands.map((h) => [...h]);
  const up = layer === 'up' ? removeFrom(state.up, seat, cards) : state.up.map((u) => [...u]);

  cards.forEach((card, index) => {
    ctx.fx.emit(Fx.DiscardCard, { card, seat, to: 'pile' }, index * PLAY_STAGGER_MS);
  });
  ctx.fx.emit(PalaceFx.Play, { seat, count: cards.length, rank, source: layer });

  let pile = [...state.pile, ...cards];
  let burn = state.burn;
  let floor: number | null = state.floor;
  let topRun: TopRun | null = state.topRun;
  let extraTurn = false;

  if (rank === BURN_RANK && state.rules.tensBurn) {
    const burned = pile.length;
    burn = [...burn, ...pile];
    pile = [];
    floor = null;
    topRun = null;
    extraTurn = true;
    ctx.fx.emit(PalaceFx.Burn, { seat, count: burned, reason: 'ten' });
  } else {
    if (rank === RESET_RANK && state.rules.twosReset) {
      floor = RESET_RANK;
    } else if (rank === BLIND_RANK && state.rules.eightsBlind) {
      // floor is transparent to a blind rank — the next play still answers
      // whatever was on the pile beneath it.
    } else {
      floor = rank;
    }
    topRun = extendRun(topRun, rank, cards.length);
    if (state.rules.fourKindBurn && topRun.count >= FOUR_KIND_COUNT) {
      const burned = pile.length;
      burn = [...burn, ...pile];
      pile = [];
      floor = null;
      topRun = null;
      extraTurn = true;
      ctx.fx.emit(PalaceFx.Burn, { seat, count: burned, reason: 'four-kind' });
    }
  }

  let next: PalaceState = { ...state, hands, up, pile, burn, floor, topRun };
  if (allEmpty(next, seat)) {
    return closeRound(next, seat, ctx);
  }
  next = { ...next, turn: extraTurn ? seat : nextSeat(next, seat) };
  ctx.fx.emit(Fx.TurnRing, { seat: next.turn! }, 80);
  return next;
}

// ---------------------------------------------------------------------------
// Payload helpers
// ---------------------------------------------------------------------------

function payloadCardList(payload: unknown): CardId[] | null {
  const raw = (payload as { cards?: unknown } | undefined)?.cards;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const cards: CardId[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry.length === 0) return null;
    cards.push(entry);
  }
  return cards;
}

function payloadSlot(payload: unknown): number | null {
  const slot = (payload as { slot?: unknown } | undefined)?.slot;
  return typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 ? slot : null;
}

interface SwapPair {
  hand: CardId;
  up: CardId;
}

function payloadPairs(payload: unknown): SwapPair[] | null {
  const raw = (payload as { pairs?: unknown } | undefined)?.pairs;
  if (!Array.isArray(raw)) return null;
  const pairs: SwapPair[] = [];
  for (const entry of raw) {
    const hand = (entry as { hand?: unknown } | null)?.hand;
    const up = (entry as { up?: unknown } | null)?.up;
    if (typeof hand !== 'string' || typeof up !== 'string') return null;
    pairs.push({ hand, up });
  }
  return pairs;
}

function isSameRank(cards: readonly CardId[]): boolean {
  if (cards.length === 0) return false;
  const rank = orderOf(cards[0]!);
  return cards.every((card) => orderOf(card) === rank);
}

// ---------------------------------------------------------------------------
// Phase
// ---------------------------------------------------------------------------

export function matchOver(state: PalaceState): boolean {
  return state.roundsWon.some((wins) => wins >= state.rules.winsTo);
}

function rankingsByWins(state: PalaceState): MatchResultRank[] {
  const ordered = state.roundsWon
    .map((wins, seat) => ({ seat, wins }))
    .sort((a, b) => b.wins - a.wins || a.seat - b.seat);
  let priorWins: number | null = null;
  let priorRank = 0;
  return ordered.map(({ seat, wins }, index) => {
    if (wins !== priorWins) priorRank = index + 1;
    priorWins = wins;
    return { seat, rank: priorRank, detail: { wins } };
  });
}

export function matchResult(state: PalaceState): MatchResult {
  const rankings = rankingsByWins(state);
  const champion = rankings.find((entry) => entry.rank === 1);
  const wins = champion?.detail?.wins;
  return {
    winner: typeof wins === 'number' && wins > 0 ? (champion!.seat as SeatId) : null,
    rankings,
    reason: 'wins-target',
  };
}

export function phaseFor(state: PalaceState): PhaseState {
  const round = state.round + 1;
  if (matchOver(state)) return { phase: 'ended', actor: null, round };
  if (state.roundWinner !== null) {
    return { phase: 'round-end', actor: null, round, label: 'round over' };
  }
  if (state.turn === null) {
    const waiting: SeatId[] = [];
    for (let seat = 0; seat < state.seats; seat++) {
      if (!state.readied.includes(seat)) waiting.push(seat);
    }
    return {
      phase: 'swap',
      actor: waiting[0] ?? null,
      actors: waiting,
      round,
      label: 'swap & ready',
    };
  }
  return { phase: 'play', actor: state.turn, round };
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

const swap: Move<PalaceState> = {
  validate(state, seat, payload) {
    if (phaseFor(state).phase !== 'swap') return error('not-swapping', 'the table is not swapping');
    if (state.readied.includes(seat)) return error('already-ready', 'this seat is already ready');
    if (state.swapped.includes(seat)) return error('already-swapped', 'this seat already swapped');
    const pairs = payloadPairs(payload);
    if (!pairs) return error('bad-payload', 'expected {pairs: [{hand, up}]}');
    const hand = handOf(state, seat);
    const up = upOf(state, seat);
    const usedHand = new Set<CardId>();
    const usedUp = new Set<CardId>();
    for (const pair of pairs) {
      if (!hand.includes(pair.hand) || usedHand.has(pair.hand)) {
        return error('not-in-hand', 'every swapped hand card must be held once');
      }
      if (!up.includes(pair.up) || usedUp.has(pair.up)) {
        return error('not-in-up', 'every swapped up card must be held once');
      }
      usedHand.add(pair.hand);
      usedUp.add(pair.up);
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const pairs = payloadPairs(payload)!;
    const hand = [...handOf(state, seat)];
    const up = [...upOf(state, seat)];
    for (const pair of pairs) {
      const handIndex = hand.indexOf(pair.hand);
      const upIndex = up.indexOf(pair.up);
      hand[handIndex] = pair.up;
      up[upIndex] = pair.hand;
      ctx.fx.emit(
        Fx.DealCard,
        { card: pair.hand, from: `hand:${seat}`, to: `up:${seat}`, dur: 180 },
        0,
      );
      ctx.fx.emit(
        Fx.DealCard,
        { card: pair.up, from: `up:${seat}`, to: `hand:${seat}`, dur: 180 },
        0,
      );
    }
    ctx.fx.emit(PalaceFx.Swap, { seat, count: pairs.length });
    return {
      ...state,
      hands: state.hands.map((h, index) => (index === seat ? hand : h)),
      up: state.up.map((u, index) => (index === seat ? up : u)),
      swapped: [...state.swapped, seat],
    };
  },
};

const ready: Move<PalaceState> = {
  validate(state, seat) {
    if (phaseFor(state).phase !== 'swap') return error('not-swapping', 'the table is not swapping');
    if (state.readied.includes(seat)) return error('already-ready', 'this seat is already ready');
    return true;
  },
  apply(state, seat, _payload, ctx) {
    ctx.fx.emit(PalaceFx.Ready, { seat });
    const readied = [...state.readied, seat];
    if (readied.length >= state.seats) {
      const starter = computeStarter({ ...state, readied }, ctx.rng);
      ctx.fx.emit(Fx.TurnRing, { seat: starter }, 80);
      return { ...state, readied, turn: starter };
    }
    return { ...state, readied };
  },
};

const playCards: Move<PalaceState> = {
  validate(state, seat, payload) {
    if (phaseFor(state).phase !== 'play')
      return error('not-playing', 'the table is not accepting plays right now');
    if (state.turn !== seat) return error('not-your-turn', 'it is another seat’s turn');
    const cards = payloadCardList(payload);
    if (!cards) return error('bad-payload', 'expected {cards: string[]}');
    const layer = activeLayer(state, seat);
    if (layer !== 'hand' && layer !== 'up') {
      return error('wrong-layer', 'this seat must play from its active layer');
    }
    const zone = layer === 'hand' ? handOf(state, seat) : upOf(state, seat);
    if (!heldOnce(zone, cards)) {
      return error('not-in-layer', `every played card must come from the ${layer}`);
    }
    if (!isSameRank(cards)) return error('mixed-ranks', 'a play must share one rank');
    const rank = orderOf(cards[0]!);
    if (!isPlayable(state.rules, state.floor, rank)) {
      return error('not-higher', 'the play must equal or beat the pile');
    }
    return true;
  },
  apply(state, seat, payload, ctx) {
    const cards = payloadCardList(payload)!;
    const layer = activeLayer(state, seat) as 'hand' | 'up';
    return resolvePlay(state, seat, cards, layer, ctx);
  },
};

const pickup: Move<PalaceState> = {
  validate(state, seat) {
    if (phaseFor(state).phase !== 'play')
      return error('not-playing', 'nothing to pick up right now');
    if (state.turn !== seat) return error('not-your-turn', 'it is another seat’s turn');
    if (state.pile.length === 0) return error('pile-empty', 'there is nothing on the pile to take');
    return true;
  },
  apply(state, seat, _payload, ctx) {
    ctx.fx.emit(PalaceFx.Pickup, { seat, count: state.pile.length, reason: 'chosen' });
    const hands = addToHand(state.hands, seat, state.pile);
    const turn = nextSeat(state, seat);
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, 80);
    return { ...state, hands, pile: [], floor: null, topRun: null, turn };
  },
};

const playDown: Move<PalaceState> = {
  validate(state, seat, payload) {
    if (phaseFor(state).phase !== 'play')
      return error('not-playing', 'the table is not accepting plays right now');
    if (state.turn !== seat) return error('not-your-turn', 'it is another seat’s turn');
    if (activeLayer(state, seat) !== 'down') {
      return error('wrong-layer', 'this seat must empty hand and face-up first');
    }
    const slot = payloadSlot(payload);
    const zone = downOf(state, seat);
    if (slot === null || slot >= zone.length)
      return error('bad-payload', 'expected {slot: number}');
    if (isVeilHandle(zone[slot]!))
      return error('not-opened', 'this down card has not been revealed yet');
    return true;
  },
  apply(state, seat, payload, ctx) {
    const slot = payloadSlot(payload)!;
    const card = downOf(state, seat)[slot]!;
    const down = state.down.map((row, index) =>
      index === seat ? row.filter((_, at) => at !== slot) : [...row],
    );
    ctx.fx.emit(Fx.FlipCard, { card, seat }, 0);
    ctx.fx.emit(PalaceFx.FlipDown, { seat, card, slot });
    const flipped: PalaceState = { ...state, down };
    const rank = orderOf(card);

    if (isPlayable(state.rules, state.floor, rank)) {
      return resolvePlay(flipped, seat, [card], 'down', ctx);
    }

    const picked = [...state.pile, card];
    ctx.fx.emit(PalaceFx.Pickup, { seat, count: picked.length, reason: 'down-miss' });
    const hands = addToHand(flipped.hands, seat, picked);
    const turn = nextSeat(flipped, seat);
    ctx.fx.emit(Fx.TurnRing, { seat: turn }, 80);
    return { ...flipped, hands, pile: [], floor: null, topRun: null, turn };
  },
};

/** Automatic-only: opens the next round once the current one has a winner. */
const nextRound: Move<PalaceState> = {
  validate(state, _seat, payload) {
    if (state.roundWinner === null)
      return error('round-in-play', 'the current round is still live');
    if (matchOver(state)) return error('match-over', 'the match has already been decided');
    if (state.veiled && !isVeiledDealPayload(payload)) {
      return { code: VEILED_REDEAL_PENDING, message: 'a veiled round needs its own shuffled deck' };
    }
    return true;
  },
  apply(state, _seat, payload, ctx) {
    return openRound(state, {
      ...ctx,
      deckOrder: isVeiledDealPayload(payload) ? payload.deckOrder : undefined,
    });
  },
};

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

function enumerablePlays(state: PalaceState, seat: SeatId): LegalMove[] {
  const layer = activeLayer(state, seat);
  if (layer === 'down') {
    return downOf(state, seat).map((_card, slot) => ({ id: 'playDown', payload: { slot } }));
  }
  if (!layer) return [];
  const zone = layer === 'hand' ? handOf(state, seat) : upOf(state, seat);
  const byRank = new Map<number, CardId[]>();
  for (const card of zone) {
    const rank = tryOrder(card);
    if (rank === null) continue;
    const bucket = byRank.get(rank) ?? [];
    bucket.push(card);
    byRank.set(rank, bucket);
  }
  const moves: LegalMove[] = [];
  for (const [rank, cards] of byRank) {
    if (!isPlayable(state.rules, state.floor, rank)) continue;
    moves.push({
      id: 'playCards',
      payload: { cards: cards.slice(0, 1) },
      hint: `1 × rank ${rank}`,
    });
    if (cards.length > 1) {
      moves.push({
        id: 'playCards',
        payload: { cards: [...cards] },
        hint: `${cards.length} × rank ${rank}`,
      });
    }
  }
  return moves;
}

function legalMovesForSeatInPlay(state: PalaceState, seat: SeatId): LegalMove[] {
  const moves = enumerablePlays(state, seat);
  if (state.pile.length > 0) moves.push({ id: 'pickup' });
  return moves;
}

function legalMovesForSeat(
  state: PalaceState,
  phase: PhaseState,
  seat: SeatId,
): readonly LegalMove[] {
  switch (phase.phase) {
    case 'swap': {
      if (!(phase.actors ?? []).includes(seat) || state.readied.includes(seat)) return [];
      const canSwap =
        !state.swapped.includes(seat) &&
        handOf(state, seat).length > 0 &&
        upOf(state, seat).length > 0;
      return canSwap ? [{ id: 'swap' }, { id: 'ready' }] : [{ id: 'ready' }];
    }
    case 'play':
      return phase.actor === seat ? legalMovesForSeatInPlay(state, seat) : [];
    default:
      return [];
  }
}

const flow: Flow<PalaceState> = {
  start(state) {
    return phaseFor(state);
  },
  legalMovesFor: legalMovesForSeat,
  legalMoves(state, phase) {
    const actors =
      phase.actors && phase.actors.length > 0
        ? phase.actors
        : phase.actor !== null
          ? [phase.actor]
          : [];
    return actors.flatMap((seat) => legalMovesForSeat(state, phase, seat));
  },
  canInject(state, _phase, moveId, payload) {
    if (moveId !== 'nextRound') {
      return error('not-injectable', `palace does not accept injected ${moveId}`);
    }
    return nextRound.validate(state, 0, payload);
  },
  advance(state) {
    if (matchOver(state)) {
      return { phase: phaseFor(state), ended: matchResult(state) };
    }
    if (state.roundWinner !== null) {
      if (state.veiled) return { phase: phaseFor(state) };
      return {
        phase: phaseFor(state),
        autoMoves: [{ seat: null, move: 'nextRound', reason: 'round-complete' }],
      };
    }
    return { phase: phaseFor(state) };
  },
};

// ---------------------------------------------------------------------------
// Setup, veil & definition
// ---------------------------------------------------------------------------

function initialState(seats: number, rules: PalaceRules, veiled: boolean): PalaceState {
  return {
    seats,
    rules,
    roundsWon: Array.from({ length: seats }, () => 0),
    round: -1,
    hands: Array.from({ length: seats }, () => [] as CardId[]),
    up: Array.from({ length: seats }, () => [] as CardId[]),
    down: Array.from({ length: seats }, () => [] as CardId[]),
    pile: [],
    burn: [],
    floor: null,
    topRun: null,
    turn: null,
    swapped: [],
    readied: [],
    roundWinner: null,
    lastOrder: null,
    veiled,
  };
}

function setup(ctx: SetupCtx<PalaceRules>): PalaceState {
  const { config, seats } = ctx;
  if (!Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) {
    throw new Error(`palace requires ${MIN_SEATS}–${MAX_SEATS} seats`);
  }
  const base = initialState(seats, config, ctx.veiled === true);
  return openRound(base, {
    rng: ctx.rng,
    fx: ctx.fx,
    event: { seq: -1 },
    deckOrder: ctx.deckOrder,
  });
}

/**
 * The up row is Veil's public setup: it deals face up, so a veiled table must
 * open exactly `seats * 3` cards, immediately after the private down row, on
 * every round — not just the first. That is why `redealMove` is set: a fresh
 * round needs a fresh ceremony to open a fresh up row, exactly like Eights'
 * per-deal starter.
 */
const palaceVeil: VeilSupport = {
  deck: () => PALACE_DECK,
  publicSetupFrom: (seats) => publicSetupFrom(seats),
  publicSetupReady: (opened, seats) => opened.length === publicSetupSize(seats),
  redealMove: 'nextRound',
};

export function createPalaceDef(
  options: { bots?: readonly BotPolicy<PalaceState>[] } = {},
): GameDef<PalaceState, PalaceRules> {
  return {
    id: GAME_ID,
    howToPlay: palaceHowToPlay,
    configSchema: palaceConfig,
    veil: palaceVeil,
    setup,
    moves: { swap, ready, playCards, pickup, playDown, nextRound },
    flow,
    playerView(state, seat) {
      return {
        ...state,
        hands: state.hands.map((cards, index) =>
          index === seat ? cards.slice() : cards.map(() => '??'),
        ),
        down: state.down.map((cards, index) =>
          index === seat ? cards.slice() : cards.map(() => '??'),
        ),
      };
    },
    end(state) {
      return matchOver(state) ? matchResult(state) : null;
    },
    bots: options.bots ?? palaceBots,
  };
}

export const palaceGame = createPalaceDef();

// Re-exported so pack-internal helpers (bots, tests) share one implementation.
export {
  DOWN_SIZE,
  UP_SIZE,
  activeLayer,
  cardCount,
  handOf,
  isAlwaysPlayable,
  isPlayable,
  upOf,
  downOf,
};
