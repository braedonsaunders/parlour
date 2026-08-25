import {
  createSession,
  isVeilHandle,
  sessionApply,
  sessionInject,
  veiledDeckOrder,
  VEILED_OPEN_PENDING,
  VEILED_REDEAL_PENDING,
  type CardId,
  type GameSession,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { DECK } from './cards';
import { pokerConfig, type PokerRules } from './config';
import { createPokerDef, pokerPublicOpens } from './game';
import type { PokerState } from './state';

const GAME = createPokerDef();
const DEFAULTS: PokerRules = pokerConfig.resolve({});
const SEATS = 3;

function veiledSession() {
  // Nothing is opened before a hold'em deal: every card starts face down.
  const deckOrder = veiledDeckOrder(GAME.veil!, SEATS, [], DEFAULTS);
  return {
    deckOrder,
    session: createSession(GAME, {
      seed: 909,
      config: DEFAULTS,
      seats: SEATS,
      veiled: true,
      deckOrder,
    }),
  };
}

/** Calls the betting round closed with everyone still in the pot. */
function checkedRound(session: GameSession<PokerState, PokerRules>) {
  let current = session;
  for (let guard = 0; guard < 12; guard += 1) {
    const seat = current.state.turn;
    if (seat === null) break;
    const legal = GAME.flow.legalMovesFor?.(current.state, current.phase, seat) ?? [];
    const move = legal.find((entry) => entry.id === 'check') ?? legal.find((e) => e.id === 'call');
    if (!move) break;
    const outcome = sessionApply(GAME, current, seat, move.id, undefined);
    if (outcome.rejected) throw new Error(`${move.id} rejected: ${outcome.rejected.message}`);
    current = outcome.session;
  }
  return current;
}

/** The card each handle stands for, for a table that has to open something. */
function faces(deckOrder: readonly CardId[]) {
  const map = new Map<CardId, CardId>();
  let next = 0;
  for (const handle of deckOrder) {
    if (isVeilHandle(handle)) map.set(handle, DECK.cardIds[next++] as CardId);
  }
  return map;
}

describe('a veiled hold’em hand', () => {
  it('deals every hole card face down, and nothing is public before the flop', () => {
    const { session, deckOrder } = veiledSession();
    expect(session.state.veiled).toBe(true);
    expect(session.state.board).toEqual([]);
    for (let seat = 0; seat < SEATS; seat++) {
      const hole = session.state.hole[seat] ?? [];
      expect(hole).toHaveLength(2);
      expect(hole.every(isVeilHandle), `seat ${seat} is dealt handles`).toBe(true);
    }
    expect(session.state.deck.every(isVeilHandle)).toBe(true);
    expect(deckOrder.every(isVeilHandle)).toBe(true);
  });

  it('will not deal a street off a deck of handles', () => {
    const { session } = veiledSession();
    const closed = checkedRound(session);
    expect(closed.state.street).toBe('preflop');

    // The board belongs to the whole table, so it cannot be turned from cards
    // only the deck order knows. The pack names the three it needs opened.
    const pending = pokerPublicOpens(closed.state);
    expect(pending?.move).toBe('dealStreet');
    expect(pending?.handles).toHaveLength(3);
    expect(pending?.handles).toEqual(closed.state.deck.slice(0, 3));

    const outcome = sessionInject(GAME, closed, 'dealStreet', undefined);
    expect(outcome.rejected?.code).toBe(VEILED_OPEN_PENDING);
  });

  it('does not auto-deal the street, because the room has to turn it first', () => {
    const { session } = veiledSession();
    const closed = checkedRound(session);
    // An open table auto-moves `dealStreet` the moment betting closes. A veiled
    // one must not: it would only produce a rejection every tick.
    const advanced = GAME.flow.advance!(
      closed.state,
      { seq: 0, seat: 0, move: 'check', payload: undefined },
      SEATS,
    );
    expect(advanced.autoMoves ?? []).toEqual([]);
  });

  it('deals the flop once the room has opened those three cards in public', () => {
    const { session, deckOrder } = veiledSession();
    const closed = checkedRound(session);
    const pending = pokerPublicOpens(closed.state)!;
    const table = faces(deckOrder);
    const reveals = pending.handles.map(
      (handle) => [handle, table.get(handle)] as [CardId, CardId],
    );

    const outcome = sessionInject(GAME, closed, pending.move, undefined, { reveals });
    expect(outcome.rejected, outcome.rejected?.message).toBeUndefined();
    expect(outcome.session.state.street).toBe('flop');
    // The board is readable by everyone, which is the whole point of a board.
    expect(outcome.session.state.board).toHaveLength(3);
    expect(outcome.session.state.board.some(isVeilHandle)).toBe(false);
    expect(outcome.session.state.board).toEqual(reveals.map(([, card]) => card));
    // And nothing else was opened: the hole cards are still nobody's business.
    for (let seat = 0; seat < SEATS; seat++) {
      expect(outcome.session.state.hole[seat]?.every(isVeilHandle)).toBe(true);
    }
  });

  it('will not score a contested pot on hands nobody can read', () => {
    const { session } = veiledSession();
    const river: GameSession<PokerState, PokerRules> = {
      ...session,
      state: { ...session.state, street: 'river', needsToAct: [false, false, false], turn: null },
    };
    const pending = pokerPublicOpens(river.state);
    expect(pending?.move).toBe('settle');
    // Every seat still in the pot, and only those, has to show.
    expect(pending?.handles).toHaveLength(SEATS * 2);
    expect(sessionInject(GAME, river, 'settle', undefined).rejected?.code).toBe(
      VEILED_OPEN_PENDING,
    );
  });

  it('never asks a folded hand to show', () => {
    const { session } = veiledSession();
    const walkover: GameSession<PokerState, PokerRules> = {
      ...session,
      state: {
        ...session.state,
        street: 'river',
        needsToAct: [false, false, false],
        turn: null,
        folded: [false, true, true],
      },
    };
    // Everyone else folded, so the pot is a walkover — mucking survives Veil.
    expect(pokerPublicOpens(walkover.state)).toBeNull();
    expect(sessionInject(GAME, walkover, 'settle', undefined).rejected).toBeUndefined();
  });

  it('will not deal the next hand from the session rng', () => {
    const { session } = veiledSession();
    const over: GameSession<PokerState, PokerRules> = {
      ...session,
      state: { ...session.state, street: 'hand-over' },
    };
    expect(sessionInject(GAME, over, 'nextHand', undefined).rejected?.code).toBe(
      VEILED_REDEAL_PENDING,
    );
    expect(GAME.veil!.redealMove).toBe('nextHand');

    const nextOrder = veiledDeckOrder(GAME.veil!, SEATS, [], DEFAULTS);
    const dealt = sessionInject(GAME, over, 'nextHand', { deckOrder: nextOrder });
    expect(dealt.rejected, dealt.rejected?.message).toBeUndefined();
    expect(dealt.session.state.handNo).toBe(2);
    expect(dealt.session.state.hole.flat().every(isVeilHandle)).toBe(true);
  });
});
