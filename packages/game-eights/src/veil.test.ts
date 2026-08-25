import {
  createSession,
  isVeilHandle,
  sessionApply,
  sessionInject,
  veiledDeckOrder,
  VEILED_REDEAL_PENDING,
  type CardId,
  type GameSession,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { eightsDeck, rankOf, WILD_RANK } from './cards';
import { eightsConfig, type EightsRules } from './config';
import { createEightsDef } from './game';
import type { EightsState } from './state';

const GAME = createEightsDef();
const DEFAULTS: EightsRules = eightsConfig.resolve({});
const SEATS = 3;

/**
 * The cards the room opens in public before the deal.
 *
 * Veiled setup opens from a fixed offset — everything before it is a hand — and
 * keeps opening until the pack says it has enough. Eights needs one card that
 * is not an eight, because a wild starter would ask the pile a question before
 * anyone could answer it.
 */
function openedStarter(): CardId[] {
  const starter = eightsDeck.cardIds.find((card) => rankOf(card) !== WILD_RANK);
  if (!starter) throw new Error('no non-wild card in the pack');
  return [starter];
}

function veiledSession() {
  const opened = openedStarter();
  const deckOrder = veiledDeckOrder(GAME.veil!, SEATS, opened, DEFAULTS);
  return {
    opened,
    deckOrder,
    session: createSession(GAME, {
      seed: 71,
      config: DEFAULTS,
      seats: SEATS,
      veiled: true,
      deckOrder,
    }),
  };
}

/** Opens every closed hand, which is what lets a veiled round be scored. */
function openEveryHand(
  session: GameSession<EightsState, EightsRules>,
  reveals: Map<CardId, CardId>,
) {
  let current = session;
  for (let seat = 0; seat < SEATS; seat++) {
    const hand = current.state.round.hands[seat] ?? [];
    if (hand.length === 0) continue;
    const opening = hand.flatMap((handle) => {
      const card = reveals.get(handle);
      return card ? [[handle, card] as const] : [];
    });
    const outcome = sessionApply(GAME, current, seat, 'round.open', undefined, {
      reveals: opening.map(([handle, card]) => [handle, card] as [CardId, CardId]),
    });
    if (outcome.rejected) throw new Error(`round.open rejected: ${outcome.rejected.message}`);
    current = outcome.session;
  }
  return current;
}

describe('a veiled crazy eights round', () => {
  it('deals handles from the ceremony order and opens only the starter', () => {
    const { session, deckOrder, opened } = veiledSession();
    expect(session.state.veiled).toBe(true);

    for (let seat = 0; seat < SEATS; seat++) {
      const hand = session.state.round.hands[seat] ?? [];
      expect(hand).toHaveLength(DEFAULTS.handSize);
      expect(hand.every(isVeilHandle), `seat ${seat} hand is handles`).toBe(true);
      expect(hand.every((card) => deckOrder.includes(card))).toBe(true);
    }
    // The one card the whole table can read is the card it has to play on.
    expect(session.state.round.discard).toEqual(opened);
    expect(isVeilHandle(session.state.round.discard[0] as CardId)).toBe(false);
    expect(session.state.round.stock.every(isVeilHandle)).toBe(true);
  });

  it('refuses a starter the table could not answer', () => {
    // Every rule about the pile keys off the active suit, and an eight names
    // its own — so a wild starter is not a legal opening, and the pack says so
    // rather than the room discovering it after the ceremony.
    const eight = eightsDeck.cardIds.find((card) => rankOf(card) === WILD_RANK) as CardId;
    expect(() => veiledDeckOrder(GAME.veil!, SEATS, [eight], DEFAULTS)).toThrow(
      /needs more public openings/,
    );
  });

  it('will not deal the next round from the session rng', () => {
    const { session } = veiledSession();
    const folded = {
      ...session,
      state: {
        ...session.state,
        folded: true,
        round: { ...session.state.round, hands: session.state.round.hands.map(() => []) },
      },
    };
    const outcome = sessionInject(GAME, folded, 'next.round', undefined);
    // The room reads this code, and only this code, as its cue to run another
    // shuffle ceremony — an ordinary rule error would mean something else.
    expect(outcome.rejected?.code).toBe(VEILED_REDEAL_PENDING);
    expect(GAME.veil!.redealMove).toBe('next.round');
  });

  it('deals the next round from the deck a fresh ceremony produced', () => {
    const { session } = veiledSession();
    const folded = {
      ...session,
      state: {
        ...session.state,
        folded: true,
        round: { ...session.state.round, hands: session.state.round.hands.map(() => []) },
      },
    };
    const nextOrder = veiledDeckOrder(GAME.veil!, SEATS, openedStarter(), DEFAULTS);
    const outcome = sessionInject(GAME, folded, 'next.round', { deckOrder: nextOrder });
    expect(outcome.rejected, outcome.rejected?.message).toBeUndefined();
    const dealt = outcome.session.state;
    expect(dealt.roundIndex).toBe(1);
    for (let seat = 0; seat < SEATS; seat++) {
      expect(dealt.round.hands[seat]).toHaveLength(DEFAULTS.handSize);
    }
    // The deck lands in the log, so the round replays for everyone and not
    // just for whoever ran the ceremony. (The whole state cannot be hashed
    // against a replay here: this fixture folds the round by editing state
    // directly, and an edit that never became an event has nothing to replay
    // from — the event carrying the deck is the property under test.)
    const injected = outcome.session.log.at(-1);
    expect(injected?.move).toBe('next.round');
    expect((injected?.payload as { deckOrder?: CardId[] } | undefined)?.deckOrder).toEqual(
      nextOrder,
    );
  });

  it('holds the round open until every hand still in play has been opened', () => {
    const { session, deckOrder } = veiledSession();
    // A hand nobody can read cannot be priced, so a round that is otherwise
    // over must not settle: scoring handles would score them all at zero.
    const shed: GameSession<EightsState, EightsRules> = {
      ...session,
      state: {
        ...session.state,
        round: {
          ...session.state.round,
          hands: session.state.round.hands.map((hand, seat) => (seat === 0 ? [] : hand)),
        },
      },
    };
    expect(shed.state.round.outcome).toBeNull();

    const phase = GAME.flow.advance!(
      shed.state,
      { seq: 0, seat: 0, move: 'playCard', payload: undefined },
      SEATS,
    );
    expect(phase.phase.phase).toBe('round-reveal');
    // Only the seats still holding cards are asked to show them.
    expect(phase.phase.actors).toEqual([1, 2]);
    expect(GAME.flow.legalMovesFor!(shed.state, phase.phase, 1)).toEqual([{ id: 'round.open' }]);
    expect(GAME.flow.legalMovesFor!(shed.state, phase.phase, 0)).toEqual([]);

    const revealing: GameSession<EightsState, EightsRules> = { ...shed, phase: phase.phase };

    // Opening them lets the arithmetic run, and the loser's cards are priced.
    // A handle can only open to a card the table cannot already see, so the
    // starter the room opened in public is not on offer here.
    const visible = new Set(shed.state.round.discard);
    const spare = eightsDeck.cardIds.filter((card) => !visible.has(card));
    const reveals = new Map<CardId, CardId>();
    let next = 0;
    for (const handle of deckOrder) {
      if (isVeilHandle(handle)) reveals.set(handle, spare[next++] as CardId);
    }
    const opened = openEveryHand(revealing, reveals);
    expect(opened.state.round.outcome?.winner).toBe(0);
    expect(opened.state.round.outcome?.reason).toBe('shed');
    expect(opened.state.round.outcome?.points).toBeGreaterThan(0);
  });

  it('will not turn a face-up discard back into a stock it has not re-veiled', () => {
    const { session } = veiledSession();
    const spent: GameSession<EightsState, EightsRules> = {
      ...session,
      state: {
        ...session.state,
        round: {
          ...session.state.round,
          stock: [],
          // Two readable cards under the face-up top: recycling these with the
          // session rng would make every remaining draw public.
          discard: [...session.state.round.discard, 'H5', 'C9'],
        },
      },
    };
    const turn = spent.state.round.turn;
    const outcome = sessionApply(GAME, spent, turn, 'draw', undefined);
    expect(outcome.rejected?.code).toBe('stock-not-reveiled');
  });
});
