import {
  createSession,
  isVeilHandle,
  replaySession,
  sessionApply,
  sessionInject,
  stateHash,
  stdDeck,
  veilHandles,
  veiledDeckOrder,
  VEILED_REDEAL_PENDING,
  type CardId,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { spadesConfig } from './config';
import { spadesGame } from './game';
import type { SpadesState } from './state';

const DEFAULTS = spadesConfig.resolve({});

function veiledSession() {
  const deckOrder = veiledDeckOrder(spadesGame.veil!, 4, [], DEFAULTS);
  return {
    deckOrder,
    session: createSession(spadesGame, {
      seed: 31,
      config: DEFAULTS,
      seats: 4,
      veiled: true,
      deckOrder,
    }),
  };
}

/** Bids the table round so the hand reaches play. */
function bidAround(session: ReturnType<typeof veiledSession>['session']) {
  let current = session;
  for (let step = 0; step < 4; step++) {
    const seat = current.state.turn;
    const outcome = sessionApply(spadesGame, current, seat, 'bid', { bid: 3 });
    if (outcome.rejected) throw new Error(`bid rejected: ${outcome.rejected.message}`);
    current = outcome.session;
  }
  return current;
}

/** Standard deck ids in the order the ceremony's handles carry them. */
const stdDeckIds = stdDeck().cardIds;

/**
 * The seat's own legal pick under veil: lead non-spade while unbroken,
 * follow the led suit when possible, anything goes when void. Mirrors what
 * the seat's resolved client would do, not a rules test.
 */
function chooseHandle(
  session: ReturnType<typeof veiledSession>['session'],
  seat: number,
  faceOf: Map<string, string>,
): string {
  const hand = (session.state.hands[seat] ?? []).slice();
  const isSpade = (face: string) => face.startsWith('S');
  if (session.state.trick === null) {
    // leading: spades locked until broken unless the whole hand is spades
    if (!session.state.spadesBroken) {
      const nonSpade = hand.find((h) => !isSpade(faceOf.get(h)!));
      if (nonSpade) return nonSpade;
    }
    return hand[0]!;
  }
  const led = session.state.trick.ledSuit;
  if (led) {
    const letter = led === 'spades' ? 'S' : led === 'hearts' ? 'H' : led === 'diamonds' ? 'D' : 'C';
    const follower = hand.find((h) => faceOf.get(h)!.startsWith(letter));
    if (follower) return follower;
  }
  return hand[0]!;
}

describe('a veiled spades hand', () => {
  it('deals handles from the ceremony order rather than shuffling its own deck', () => {
    const { session, deckOrder } = veiledSession();
    expect(session.state.veiled).toBe(true);
    for (let seat = 0; seat < 4; seat++) {
      const hand = session.state.hands[seat] ?? [];
      expect(hand).toHaveLength(13);
      expect(hand.every(isVeilHandle)).toBe(true);
      expect(hand.every((card) => deckOrder.includes(card))).toBe(true);
    }
  });

  it('offers a play without naming the card, because only the seat can read it', () => {
    const session = bidAround(veiledSession().session);
    const seat = session.state.turn;
    const legal = spadesGame.flow.legalMovesFor!(session.state, session.phase, seat);
    expect(legal).toEqual([{ id: 'playCard' }]);
  });

  it('plays a card the seat opens as it goes down', () => {
    const session = bidAround(veiledSession().session);
    const seat = session.state.turn;
    const handle = (session.state.hands[seat] ?? [])[0]!;
    const face: CardId = 'H7';

    const outcome = sessionApply(
      spadesGame,
      session,
      seat,
      'playCard',
      { card: face },
      { reveals: [[handle, face]] },
    );
    expect(outcome.rejected).toBeUndefined();
    // The played card is public and the rest of the hand is not.
    expect(outcome.session.state.plays.at(-1)?.card).toBe(face);
    expect((outcome.session.state.hands[seat] ?? []).every(isVeilHandle)).toBe(true);
  });

  // The authority holds handles, so it cannot see what a seat could have
  // followed with. The protocol audits a revoke after the match instead of
  // pretending to catch it live — see apps/web/src/lib/multiplayer/veil.
  it('does not enforce following suit against cards it cannot read', () => {
    const session = bidAround(veiledSession().session);
    const leader = session.state.turn;
    const lead = sessionApply(
      spadesGame,
      session,
      leader,
      'playCard',
      { card: 'H7' },
      { reveals: [[(session.state.hands[leader] ?? [])[0]!, 'H7']] },
    ).session;

    const next = lead.state.turn;
    const offSuit: CardId = 'D2';
    const outcome = sessionApply(
      spadesGame,
      lead,
      next,
      'playCard',
      { card: offSuit },
      { reveals: [[(lead.state.hands[next] ?? [])[0]!, offSuit]] },
    );
    expect(outcome.rejected).toBeUndefined();
  });

  it('refuses an early spade lead unless the hand is opened to prove it is all spades', () => {
    const session = bidAround(veiledSession().session);
    const seat = session.state.turn;
    const handle = (session.state.hands[seat] ?? [])[0]!;

    const bluff = sessionApply(
      spadesGame,
      session,
      seat,
      'playCard',
      { card: 'S4' },
      { reveals: [[handle, 'S4']] },
    );
    expect(bluff.rejected?.code).toBe('bad-claim');
  });
});

describe('a veiled spades match', () => {
  it('waits for a shuffled deck instead of dealing its next hand from the rng', () => {
    const { session } = veiledSession();
    const handOver: SpadesState = { ...session.state, stage: 'hand-over' };
    expect(spadesGame.moves['nextHand']!.validate(handOver, 0, undefined)).toMatchObject({
      code: VEILED_REDEAL_PENDING,
    });
    // An open match is untouched: it still deals itself the next hand.
    expect(
      spadesGame.moves['nextHand']!.validate({ ...handOver, veiled: false }, 0, undefined),
    ).toBe(true);
  });

  it('deals the next hand from the deck the room shuffled, with fresh handles', () => {
    const session = veiledSession().session;
    const second = veilHandles(104).slice(52);
    const dealt = sessionInject(spadesGame, session, 'nextHand', { deckOrder: second });

    expect(dealt.rejected).toBeUndefined();
    expect(dealt.session.state.handNo).toBe(2);
    for (let seat = 0; seat < 4; seat++) {
      const hand = dealt.session.state.hands[seat] ?? [];
      expect(hand).toHaveLength(13);
      // Numbered past the first deck, so a second hand cannot reissue a card
      // the first one spent.
      expect(hand.every((card) => second.includes(card))).toBe(true);
    }
  });

  it('replays a veiled hand bit-for-bit from its log', () => {
    const session = bidAround(veiledSession().session);
    const seat = session.state.turn;
    const played = sessionApply(
      spadesGame,
      session,
      seat,
      'playCard',
      { card: 'H7' },
      { reveals: [[(session.state.hands[seat] ?? [])[0]!, 'H7']] },
    ).session;

    const replayed = replaySession(spadesGame, 31, played.log, {
      config: DEFAULTS,
      seats: 4,
      veiled: true,
      deckOrder: veiledDeckOrder(spadesGame.veil!, 4, [], DEFAULTS),
    });
    expect(stateHash(replayed.state)).toBe(stateHash(played.state));
  });

  it('plays a full veiled hand and redeals through a second ceremony', () => {
    // The shape every real evening takes: ceremony, hand, ceremony, hand.
    // The first deal's faces come from the first ceremony's deck; the second
    // hand's handles come from the second epoch, so nothing from hand one can
    // be reissued.
    const first = veiledSession();
    let session = bidAround(first.session);
    const faceOf = new Map<string, string>();
    for (let i = 0; i < 52; i++) faceOf.set(first.deckOrder[i]!, stdDeckIds[i]!);

    // Play all 13 tricks: each card arrives with its reveal.
    let guard = 0;
    while (session.status === 'playing' && session.state.stage === 'playing' && guard++ < 60) {
      const seat = session.state.turn;
      const hand = session.state.hands[seat] ?? [];
      if (hand.length === 0) break;
      // Under veil the engine cannot enumerate face-legal plays; the seat
      // picks from its own resolved hand. Playing the first handle is the
      // peel chain's shape, but the rules still gate it: an early spade lead
      // with a non-spade in hand is a `bad-claim`, so the driver follows the
      // seat's own suit-resolved choice — first non-spade while unbroken.
      const pickHandle = chooseHandle(session, seat, faceOf);
      const face = faceOf.get(pickHandle)!;
      const outcome = sessionApply(
        spadesGame,
        session,
        seat,
        'playCard',
        { card: face },
        {
          reveals: [[pickHandle, face] as const],
        },
      );
      expect(outcome.rejected).toBeUndefined();
      session = outcome.session;
    }
    expect(session.state.stage).toBe('hand-over');
    expect(session.state.tricksPlayed).toBe(13);

    // The second hand waits for a fresh ceremony, then deals new handles.
    const secondDeck = veilHandles(104).slice(52);
    const dealt = sessionInject(spadesGame, session, 'nextHand', { deckOrder: secondDeck });
    expect(dealt.rejected).toBeUndefined();
    expect(dealt.session.state.handNo).toBe(2);
    expect(dealt.session.state.stage).toBe('bidding');
    const newHandles = new Set(dealt.session.state.hands.flat());
    for (const card of newHandles) expect(secondDeck).toContain(card);
    // Nothing reissued from epoch one.
    for (const card of newHandles) expect(first.deckOrder).not.toContain(card);

    // Bid and play hand two to hand-over under the second epoch.
    const secondFace = new Map<string, string>();
    for (let i = 0; i < 52; i++) secondFace.set(secondDeck[i]!, stdDeckIds[i]!);
    session = bidAround(dealt.session);
    guard = 0;
    while (session.status === 'playing' && session.state.stage === 'playing' && guard++ < 60) {
      const seat = session.state.turn;
      const hand = session.state.hands[seat] ?? [];
      if (hand.length === 0) break;
      const pickHandle = chooseHandle(session, seat, secondFace);
      const face = secondFace.get(pickHandle)!;
      const outcome = sessionApply(
        spadesGame,
        session,
        seat,
        'playCard',
        { card: face },
        {
          reveals: [[pickHandle, face] as const],
        },
      );
      expect(outcome.rejected).toBeUndefined();
      session = outcome.session;
    }
    expect(session.state.stage).toBe('hand-over');
    expect(session.state.tricksPlayed).toBe(13);
  });
});
