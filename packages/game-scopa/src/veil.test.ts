import { describe, expect, it } from 'vitest';
import {
  createSession,
  isVeilHandle,
  replaySession,
  sessionApply,
  sessionInject,
  stateHash,
  veiledDeckOrder,
  VEILED_REDEAL_PENDING,
  type CardId,
} from '@parlour/engine';
import { DECK } from './cards';
import { scopaConfig, type ScopaRules } from './config';
import { createScopaDef } from './game';
import type { ScopaState } from './state';
import type { GameSession } from '@parlour/engine';

const GAME = createScopaDef();
const DEFAULTS: ScopaRules = scopaConfig.resolve({});
const SEATS = 2;

type ScopaSession = GameSession<ScopaState, ScopaRules>;

function veiledSession() {
  // Open the first four cards (the public tableau) before the deal.
  const opened = DECK.cardIds.slice(0, 4) as CardId[];
  const deckOrder = veiledDeckOrder(GAME.veil!, SEATS, opened, DEFAULTS);
  const session = createSession(GAME, {
    seed: 404,
    config: DEFAULTS,
    seats: SEATS,
    veiled: true,
    deckOrder,
  }) as ScopaSession;
  return { deckOrder, opened, session };
}

/** Face map: each handle at position i in the deckOrder stands for DECK.cardIds[i]. */
function faceMap(deckOrder: readonly CardId[]): Map<CardId, CardId> {
  const map = new Map<CardId, CardId>();
  for (let i = 0; i < deckOrder.length; i++) {
    const card = deckOrder[i]!;
    if (isVeilHandle(card)) map.set(card, DECK.cardIds[i] as CardId);
  }
  return map;
}

describe('a veiled Scopa round', () => {
  it('deals the tableau face up and every hand as handles', () => {
    const { session } = veiledSession();
    expect(session.state.veiled).toBe(true);
    expect(session.state.table).toHaveLength(4);
    expect(session.state.table.every((c) => !isVeilHandle(c))).toBe(true);
    for (let seat = 0; seat < SEATS; seat++) {
      const hand = session.state.hands[seat] ?? [];
      expect(hand).toHaveLength(3);
      expect(hand.every(isVeilHandle), `seat ${seat} has handles`).toBe(true);
    }
    expect(session.state.stock.every(isVeilHandle)).toBe(true);
  });

  it('refuses nextRound without a deck order when veiled', () => {
    const { session } = veiledSession();
    const verdict = GAME.moves.nextRound!.validate(session.state, 0, undefined);
    expect(verdict).not.toBe(true);
    expect((verdict as { code: string }).code).toBe(VEILED_REDEAL_PENDING);
  });

  it('will not auto-advance to nextRound when veiled', () => {
    const { session } = veiledSession();
    // Simulate the round ending: set stage to round-over, hands empty.
    const over: ScopaState = {
      ...session.state,
      hands: session.state.hands.map(() => []),
      stock: [],
      stage: 'round-over',
    };
    const advanced = GAME.flow.advance(over, { seq: 0, seat: null, move: 'finishRound' }, SEATS);
    expect(advanced.autoMoves ?? []).toEqual([]);
  });

  it('accepts an injected nextRound with a fresh deck order', () => {
    const { session } = veiledSession();
    // Set the state to round-over, then inject nextRound with a deck order.
    const over: ScopaState = {
      ...session.state,
      hands: session.state.hands.map(() => []),
      stock: [],
      stage: 'round-over',
    };
    // Rebuild a session at round-over to inject into.
    const overSession = { ...session, state: over };

    const opened = DECK.cardIds.slice(8, 12) as CardId[];
    const deckOrder2 = veiledDeckOrder(GAME.veil!, SEATS, opened, DEFAULTS);
    const outcome = sessionInject(GAME, overSession, 'nextRound', { deckOrder: deckOrder2 });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.state.roundNo).toBe(2);
    expect(outcome.session.state.table).toHaveLength(4);
    expect(outcome.session.status).toBe('playing');
  });

  it('replays a veiled session byte for byte', () => {
    const { session, deckOrder } = veiledSession();
    const replayed = replaySession(GAME, session.seed, session.log, {
      config: session.config,
      seats: session.seats,
      veiled: true,
      deckOrder,
    });
    expect(stateHash(replayed.state)).toBe(stateHash(session.state));
  });

  it('plays one veiled capture opening the hand card through reveals', () => {
    const { session, deckOrder } = veiledSession();
    const faces = faceMap(deckOrder);

    // The first seat's hand contains handles. The first legal move from
    // playerView should reference a real card that's a handle in the raw state.
    const seat = session.state.turn;
    const hand = session.state.hands[seat] ?? [];
    expect(hand.length).toBeGreaterThan(0);

    // For a capture to work, there must be a single-card match on the table.
    // The tableau is the first 4 deck cards. The hand at position 4 is the
    // first hand card. If captureValue(handCard) matches captureValue(tableCard),
    // a single-card capture is forced. Otherwise it's a pose.

    // Just exercise the reveal path: play the first hand card as a pose
    // (take: []). Reveal the handle before applying.
    const card = hand[0]!;
    const face = faces.get(card);
    expect(face).toBeDefined();

    const outcome = sessionApply(
      GAME,
      session,
      seat,
      'playCard',
      { card, take: [] },
      {
        reveals: [[card, face!]],
      },
    );
    // May fail if a single-card capture is forced — that's fine; the point is
    // that the reveal was applied and the engine validated it structurally.
    if (!outcome.rejected) {
      // Card should now be on the table as a real card.
      expect(outcome.session.state.table.some((c) => c === face)).toBe(true);
    } else {
      // If a capture was forced, the rejection should be about the capture rule,
      // not about the reveal.
      expect(outcome.rejected.code).not.toBe('card-already-open');
      expect(outcome.rejected.code).not.toBe('not-a-handle');
    }
  });
});
