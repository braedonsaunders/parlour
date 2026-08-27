import {
  veilSupport,
  type BotPolicy,
  type CardId,
  type Flow,
  type GameDef,
  type LegalMove,
  type MatchResult,
  type MatchResultRank,
  type Move,
  type PhaseState,
  type RuleError,
  type SeatId,
} from '@parlour/engine';
import { beats, durakDeck } from './cards';
import { durakConfig, type DurakRules } from './config';
import { durakHowToPlay } from './howto';
import {
  attackActors,
  boutBeaten,
  canAttack,
  canDefend,
  canPass,
  canTakeCards,
  canTransfer,
  DURAK_MAX_SEATS,
  DURAK_MIN_SEATS,
  applyAttack,
  applyDefend,
  applyPass,
  applyTransfer,
  dealDurak,
  effectiveHandSize,
  handOf,
  hasPending,
  instantWinOutcome,
  resolveBout,
} from './round';
import type { DurakState } from './state';

export const GAME_ID = 'durak';

function error(code: string, message: string): RuleError {
  return { code, message };
}

function payloadCard(payload: unknown): CardId | null {
  const card = (payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' ? card : null;
}

function payloadAttack(payload: unknown): CardId | null {
  const attack = (payload as { attack?: unknown } | undefined)?.attack;
  return typeof attack === 'string' ? attack : null;
}

/** Every move that can empty a hand checks the heads-up instant-win rule on the way out. */
function afterMove(state: DurakState): DurakState {
  const outcome = instantWinOutcome(state);
  if (!outcome) return state;
  return { ...state, outcome, table: [], attackers: [], passed: [] };
}

// ---------------------------------------------------------------------------
// moves
// ---------------------------------------------------------------------------

const attack: Move<DurakState> = {
  validate(state, seat, payload) {
    if (state.outcome) return error('match-over', 'the hand is already decided');
    const card = payloadCard(payload);
    if (!card) return error('bad-payload', 'expected {card}');
    if (!handOf(state, seat).includes(card))
      return error('not-in-hand', `${card} is not in the hand`);
    return canAttack(state, seat, card)
      ? true
      : error('cannot-attack', `${card} cannot be thrown into this bout`);
  },
  apply(state, seat, payload, ctx) {
    const card = payloadCard(payload);
    if (!card) throw new Error('attack apply requires a card');
    return afterMove(applyAttack(state, seat, card, ctx.fx));
  },
};

const defend: Move<DurakState> = {
  validate(state, seat, payload) {
    if (state.outcome) return error('match-over', 'the hand is already decided');
    if (seat !== state.defender) return error('not-defender', 'only the defender can beat a card');
    const card = payloadCard(payload);
    const attackCard = payloadAttack(payload);
    if (!card || !attackCard) return error('bad-payload', 'expected {attack, card}');
    if (!handOf(state, seat).includes(card))
      return error('not-in-hand', `${card} is not in the hand`);
    return canDefend(state, attackCard, card)
      ? true
      : error('cannot-defend', `${card} does not beat ${attackCard}`);
  },
  apply(state, _seat, payload, ctx) {
    const card = payloadCard(payload);
    const attackCard = payloadAttack(payload);
    if (!card || !attackCard) throw new Error('defend apply requires {attack, card}');
    return afterMove(applyDefend(state, attackCard, card, ctx.fx));
  },
};

const transfer: Move<DurakState> = {
  validate(state, seat, payload) {
    if (state.outcome) return error('match-over', 'the hand is already decided');
    if (!state.rules.transfer) return error('transfer-off', 'this table does not allow transfers');
    if (seat !== state.defender) return error('not-defender', 'only the defender can transfer');
    const card = payloadCard(payload);
    if (!card) return error('bad-payload', 'expected {card}');
    if (!handOf(state, seat).includes(card))
      return error('not-in-hand', `${card} is not in the hand`);
    return canTransfer(state, card)
      ? true
      : error('cannot-transfer', `${card} cannot transfer this attack`);
  },
  apply(state, _seat, payload, ctx) {
    const card = payloadCard(payload);
    if (!card) throw new Error('transfer apply requires a card');
    return afterMove(applyTransfer(state, card, ctx.fx));
  },
};

const takeCards: Move<DurakState> = {
  validate(state, seat) {
    if (state.outcome) return error('match-over', 'the hand is already decided');
    if (seat !== state.defender)
      return error('not-defender', 'only the defender can pick up the table');
    return canTakeCards(state)
      ? true
      : error('nothing-to-take', 'there is nothing on the table yet');
  },
  apply(state, _seat, _payload, ctx) {
    return resolveBout(state, true, ctx.fx);
  },
};

const pass: Move<DurakState> = {
  validate(state, seat) {
    if (state.outcome) return error('match-over', 'the hand is already decided');
    return canPass(state, seat)
      ? true
      : error('cannot-pass', 'seat has nothing to decline right now');
  },
  apply(state, seat) {
    return applyPass(state, seat);
  },
};

const boutResolve: Move<DurakState> = {
  validate(state) {
    if (state.outcome) return error('match-over', 'the hand is already decided');
    return boutBeaten(state) ? true : error('bout-not-beaten', 'the bout is not finished');
  },
  apply(state, _seat, _payload, ctx) {
    return resolveBout(state, false, ctx.fx);
  },
};

// ---------------------------------------------------------------------------
// flow
// ---------------------------------------------------------------------------

function currentPhase(state: DurakState): PhaseState {
  if (state.outcome) return { phase: 'over', actor: null, round: state.boutIndex };
  if (hasPending(state)) {
    return {
      phase: 'defend',
      actor: state.defender,
      round: state.boutIndex,
      label: 'beat it or take it',
    };
  }
  const actors = attackActors(state);
  return {
    phase: 'attack',
    actor: actors[0] ?? null,
    actors,
    round: state.boutIndex,
    label: state.table.length === 0 ? 'open the bout' : 'throw in or pass',
  };
}

function legalMovesForSeat(state: DurakState, phase: PhaseState, seat: SeatId): LegalMove[] {
  if (phase.phase === 'over') return [];
  if (phase.phase === 'defend') {
    return seat === state.defender ? defendMoves(state) : [];
  }
  if (!(phase.actors ?? []).includes(seat)) return [];
  return attackMoves(state, seat);
}

function defendMoves(state: DurakState): LegalMove[] {
  const moves: LegalMove[] = [];
  const hand = handOf(state, state.defender);
  for (const pair of state.table) {
    if (pair.defend !== null) continue;
    for (const card of hand) {
      if (beats(pair.attack, card, state.trumpSuit)) {
        moves.push({ id: 'defend', payload: { attack: pair.attack, card } });
      }
    }
  }
  for (const card of hand) {
    if (canTransfer(state, card)) moves.push({ id: 'transfer', payload: { card } });
  }
  moves.push({ id: 'takeCards' });
  return moves;
}

function attackMoves(state: DurakState, seat: SeatId): LegalMove[] {
  const moves: LegalMove[] = [];
  for (const card of handOf(state, seat)) {
    if (canAttack(state, seat, card)) moves.push({ id: 'attack', payload: { card } });
  }
  if (canPass(state, seat)) moves.push({ id: 'pass' });
  return moves;
}

const flow: Flow<DurakState> = {
  start(state) {
    return currentPhase(state);
  },

  legalMoves(state, phase) {
    return phase.actor === null ? [] : legalMovesForSeat(state, phase, phase.actor);
  },

  legalMovesFor(state, phase, seat) {
    return legalMovesForSeat(state, phase, seat);
  },

  advance(state) {
    if (state.outcome) {
      return { phase: currentPhase(state), ended: matchResultFor(state) ?? undefined };
    }
    if (boutBeaten(state)) {
      return {
        phase: currentPhase(state),
        autoMoves: [{ seat: null, move: 'bout.resolve', reason: 'bout complete' }],
      };
    }
    return { phase: currentPhase(state) };
  },
};

// ---------------------------------------------------------------------------
// match result
// ---------------------------------------------------------------------------

function buildRankings(state: DurakState): MatchResultRank[] {
  const outcome = state.outcome;
  if (!outcome) return [];
  const rankings: MatchResultRank[] = outcome.order.map((seat, index) => ({
    seat,
    rank: index + 1,
    detail: { durak: false },
  }));
  if (outcome.loser !== null) {
    rankings.push({ seat: outcome.loser, rank: outcome.order.length + 1, detail: { durak: true } });
  }
  return rankings;
}

export function matchResultFor(state: DurakState): MatchResult | null {
  const outcome = state.outcome;
  if (!outcome) return null;
  const rankings = buildRankings(state);
  const winner = rankings.find((rank) => rank.rank === 1)?.seat ?? null;
  return {
    winner,
    rankings,
    reason: outcome.loser === null ? 'durak-draw' : 'durak',
  };
}

// ---------------------------------------------------------------------------
// the def
// ---------------------------------------------------------------------------

export interface DurakDefOptions {
  bots?: readonly BotPolicy<DurakState>[];
}

export function createDurakDef(options: DurakDefOptions = {}): GameDef<DurakState, DurakRules> {
  return {
    id: GAME_ID,
    howToPlay: durakHowToPlay,
    configSchema: durakConfig,

    /**
     * Veil. The trump card is the one setup card every room turns face up —
     * it sits right after every hand in the deal order, exactly where a
     * physical table would flip it before sliding the rest under it as stock.
     * Durak is a single hand, so there is no redeal move to name.
     */
    veil: veilSupport({
      deck: durakDeck,
      handSize: (config, seats) => effectiveHandSize(seats, (config as DurakRules).refillTo),
      publicSetup: 'one',
    }),

    setup(ctx) {
      const { config, seats } = ctx;
      if (!Number.isInteger(seats) || seats < DURAK_MIN_SEATS || seats > DURAK_MAX_SEATS) {
        throw new Error(`durak requires ${DURAK_MIN_SEATS}–${DURAK_MAX_SEATS} seats`);
      }
      const dealt = dealDurak({
        config,
        seats,
        rng: ctx.rng,
        fx: ctx.fx,
        deckOrder: ctx.deckOrder,
      });
      return { ...dealt, veiled: ctx.veiled === true };
    },

    moves: {
      attack,
      defend,
      transfer,
      takeCards,
      pass,
      'bout.resolve': boutResolve,
    },

    flow,

    playerView(state, seat) {
      const stockSize = state.stock.length;
      return {
        ...state,
        hands: state.hands.map((cards, index) =>
          index === seat ? cards.slice() : cards.map(() => '??'),
        ),
        stock: state.stock.map((card, index) => (index === stockSize - 1 ? card : '??')),
      };
    },

    end: matchResultFor,

    bots: options.bots ?? [],
  };
}
