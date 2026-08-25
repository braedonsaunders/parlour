import {
  createSession,
  isVeilHandle,
  replaySession,
  sessionApply,
  sessionInject,
  stateHash,
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
});
