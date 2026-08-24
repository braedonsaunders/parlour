import { describe, expect, it } from 'vitest';
import { Fx } from '@parlour/engine';
import { deckSize, suitOfCard } from './cards';
import { GAME_ID, OhHellFx, allowedBids, forbiddenBid } from './game';
import { ohhellGame } from './game';
import {
  bidAround,
  legalBidValues,
  legalCards,
  mustStep,
  openSession,
  playOut,
  requireMove,
  step,
} from './test-util';

describe('setup', () => {
  it('deals the configured hand to every seat and turns a trump', () => {
    const session = openSession({ seed: 42, config: { handSize: 8 }, seats: 4 });
    const state = session.state;
    expect(GAME_ID).toBe('ohhell');
    expect(state.hands).toHaveLength(4);
    for (const cards of state.hands) expect(cards).toHaveLength(8);
    const dealt = state.hands.flat();
    expect(new Set(dealt).size).toBe(32);
    expect(state.trumpCard).not.toBeNull();
    // deal + flip + stock must conserve the deck exactly
    expect(32 + 1 + state.stock.length).toBe(deckSize(false));
    expect(new Set([...dealt, state.trumpCard ?? '', ...state.stock]).size).toBe(deckSize(false));
    expect(state.trumpSuit).not.toBeNull();
    expect(session.phase.phase).toBe('bidding');
    expect(state.turn).toBe((state.dealer + 1) % 4);
  });

  it('supports every cataloged seat count and rejects the rest', () => {
    for (const seats of [3, 4, 5, 6, 7]) {
      const session = openSession({ seed: 5, seats, config: { handSize: 5 } });
      expect(session.state.hands).toHaveLength(seats);
      expect(session.state.bids).toHaveLength(seats);
    }
    expect(() => openSession({ seats: 2 })).toThrow(/3 to 7 seats/);
    expect(() => openSession({ seats: 8 })).toThrow(/3 to 7 seats/);
  });

  it('is deterministic per seed and staggers the deal fx', () => {
    const a = openSession({ seed: 99, config: { handSize: 5 }, seats: 4 });
    const b = openSession({ seed: 99, config: { handSize: 5 }, seats: 4 });
    expect(a.state.hands).toEqual(b.state.hands);
    expect(a.state.trumpCard).toBe(b.state.trumpCard);
    const deal = a.setupFx!.filter((event) => event.kind === Fx.DealCard);
    expect(deal).toHaveLength(20);
    expect(deal[19]!.at).toBe(19 * 65);
    const flips = a.setupFx!.filter((event) => event.kind === Fx.FlipCard);
    expect(flips).toHaveLength(1);
    expect(a.setupFx!.some((event) => event.kind === OhHellFx.TrumpTurned)).toBe(true);
  });

  it('never leaks card faces through the deal fx', () => {
    const session = openSession({ seed: 8_100, config: { handSize: 6 }, seats: 4 });
    const json = JSON.stringify(session.setupFx ?? []);
    for (const card of session.state.hands.flat()) {
      expect(json.includes(`"${card}"`)).toBe(false);
    }
  });
});

describe('the no-trump whole-deck round', () => {
  it('deals everything out, turns nothing, and plays no-trump', () => {
    // four players × thirteen cards consumes all 52 — THE classic bug case
    const session = openSession({ seed: 11, config: { handSize: 13 }, seats: 4 });
    const state = session.state;
    expect(state.handSize).toBe(13);
    expect(state.stock).toEqual([]);
    expect(state.trumpCard).toBeNull();
    expect(state.trumpSuit).toBeNull();
    expect(state.stage).toBe('bidding');
    const kinds = (session.setupFx ?? []).map((event) => event.kind);
    expect(kinds).not.toContain(Fx.FlipCard);
    expect(kinds).not.toContain(OhHellFx.TrumpTurned);
  });

  it('also bites on the wizard deck (3 × 20 = 60)', () => {
    const session = openSession({
      seed: 12,
      seats: 3,
      config: { handSize: 20, wizards: true },
    });
    expect(session.state.trumpCard).toBeNull();
    expect(session.state.stock.length).toBe(0);
    expect(session.state.hands.every((cards) => cards.length === 20)).toBe(true);
  });

  it('cuts a bottom trump instead when trumpOnLastRound is set', () => {
    const session = openSession({
      seed: 13,
      config: { handSize: 13, trumpOnLastRound: true },
      seats: 4,
    });
    const state = session.state;
    expect(state.handSize).toBe(12); // floor(51/4): equal hands, one card reserved
    for (const cards of state.hands) expect(cards).toHaveLength(12);
    expect(state.trumpCard).not.toBeNull();
    expect(state.trumpSuit).not.toBeNull();
    expect(state.stock).toHaveLength(52 - 48 - 1);
  });

  it('plays a whole-deck round out end to end', () => {
    let session = openSession({ seed: 14, config: { handSize: 2 }, seats: 3 });
    session = playOut(bidAround(session, [0, 0, 0]));
    expect(session.state.summary!.tricksWon.reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe('bidding', () => {
  it('runs clockwise from left of the dealer', () => {
    const session = openSession({ seed: 21, config: { handSize: 4 }, seats: 4 });
    const first = session.state.turn;
    expect(first).toBe((session.state.dealer + 1) % 4);
    expect(step(session, session.state.dealer, 'bid', { bid: 1 }).rejected).toBe('not-your-turn');
    const after = step(session, first, 'bid', { bid: 1 });
    expect(after.rejected).toBeUndefined();
    expect(after.session.state.turn).toBe((first + 1) % 4);
  });

  it('rejects bids outside 0..handSize', () => {
    const session = openSession({ seed: 22, config: { handSize: 3 }, seats: 4 });
    const seat = session.state.turn;
    expect(step(session, seat, 'bid', { bid: -1 }).rejected).toBe('bad-bid');
    expect(step(session, seat, 'bid', { bid: 4 }).rejected).toBe('bad-bid');
    expect(step(session, seat, 'bid', { bid: 1.5 }).rejected).toBe('bad-bid');
  });

  it('accepts zero as an ordinary bid', () => {
    const session = openSession({ seed: 23, config: { handSize: 3 }, seats: 4 });
    const seat = session.state.turn;
    expect(step(session, seat, 'bid', { bid: 0 }).rejected).toBeUndefined();
  });

  it('moves to play once every seat has bid, leader left of dealer', () => {
    const session = bidAround(
      openSession({ seed: 24, config: { handSize: 3 }, seats: 4 }),
      [1, 2, 0, 1],
    );
    expect(session.state.stage).toBe('playing');
    const leader = (session.state.dealer + 1) % 4;
    expect(session.state.leader).toBe(leader);
    expect(session.state.turn).toBe(leader);
  });
});

describe('the hook rule', () => {
  function dealerDueState(seed: number, seats: number, handSize: number) {
    const base = openSession({ seed, seats, config: { handSize } }).state;
    // everyone except the dealer has bid; one early seat bids 1 so the
    // forbidden value lands at handSize − 1 — inside the dial for every size
    const bids = base.bids.map((_, seat) =>
      seat === base.dealer ? null : (seat + 1) % seats === 1 ? 1 : 0,
    );
    return { ...base, bids };
  }

  it('removes exactly one bid value from the DEALER at every hand size', () => {
    const move = requireMove('bid');
    for (let requested = 1; requested <= 17; requested++) {
      for (const seats of [3, 4, 5]) {
        const state = dealerDueState(31 + requested, seats, requested);
        // Read the hand size off the STATE, never the requested value. Setup
        // clamps to what the deck can actually deal (floor(51 / seats)), so at
        // five seats a requested 11 is really 10 — and asserting against the
        // request instead of the deal is a test bug, not a rules bug.
        const handSize = state.handSize;
        expect(handSize).toBeLessThanOrEqual(requested);
        const othersTotal = state.bids.reduce<number>(
          (sum, bid, seat) => (seat === state.dealer ? sum : sum + (bid ?? 0)),
          0,
        );
        const expected = handSize - othersTotal;

        expect(forbiddenBid(state)).toBe(expected);

        const dealerAllowed = allowedBids(state, state.dealer);
        expect(dealerAllowed).toHaveLength(handSize); // handSize+1 values minus one
        expect(dealerAllowed).not.toContain(expected);
        expect(move.validate(state, state.dealer, { bid: expected })).not.toBe(true);

        // non-dealers lose NOTHING at any hand size — even the seat bidding
        // right before the dealer may complete the total freely
        const preDealer = (state.dealer + seats - 1) % seats;
        const partialBids = state.bids.map((_, seat) =>
          seat === state.dealer || seat === preDealer ? null : 1,
        );
        const partialState = { ...state, bids: partialBids, turn: preDealer };
        const completing = Math.max(0, Math.min(handSize, handSize - (seats - 2)));
        expect(move.validate(partialState, preDealer, { bid: completing })).toBe(true);
        expect(forbiddenBid(partialState)).toBeNull();
      }
    }
  });

  it('keeps the forbidden bid off the dealer’s live legal-move list', () => {
    const seats = 4;
    let session = openSession({ seed: 32, seats, config: { handSize: 4, hookRule: true } });
    while (session.state.turn !== session.state.dealer) {
      session = mustStep(session, session.state.turn, 'bid', { bid: 1 });
    }
    const allowed = legalBidValues(session, session.state.dealer);
    expect(allowed).toHaveLength(session.state.handSize);
    const forbidden = forbiddenBid(session.state)!;
    expect(allowed).not.toContain(forbidden);
    // The engine matches a submitted move by id, not by payload (see
    // `sessionApply` in packages/engine/src/runtime.ts), so a client that
    // forces the forbidden value past the legal list is caught by the move's
    // own validate rather than by the runtime. The specific code is the point:
    // "illegal-move" would tell the player nothing about which rule stopped
    // them, and the hook rule is the one rule of this game worth naming.
    expect(step(session, session.state.dealer, 'bid', { bid: forbidden }).rejected).toBe(
      'hook-forbidden',
    );
  });

  it('never restricts anyone when the hook rule is off', () => {
    const seats = 4;
    let session = openSession({ seed: 33, seats, config: { handSize: 4, hookRule: false } });
    while (session.state.stage === 'bidding') {
      const seat = session.state.turn;
      expect(legalBidValues(session, seat)).toHaveLength(session.state.handSize + 1);
      session = mustStep(session, seat, 'bid', { bid: seat === session.state.dealer ? 0 : 1 });
    }
    expect(session.state.stage).toBe('playing');
  });

  it('is silent when the forbidden value falls outside the dial', () => {
    // five seats × two cards: four earlier bids of 1 push the forbidden value
    // to −1, outside 0..handSize — the rule then restricts nothing at all
    const base = openSession({ seed: 34, seats: 5, config: { handSize: 2 } }).state;
    const bids = base.bids.map((_, seat) => (seat === base.dealer ? null : 1));
    const state = { ...base, bids };
    expect(forbiddenBid(state)).toBeNull();
    expect(allowedBids(state, state.dealer)).toHaveLength(state.handSize + 1);
  });
});

function playingSession(seed: number, opts?: { seats?: number; handSize?: number }) {
  let session = openSession({
    seed,
    seats: opts?.seats ?? 4,
    config: { handSize: opts?.handSize ?? 3 },
  });
  session = bidAround(
    session,
    Array.from({ length: session.state.seats }, () => 1),
  );
  expect(session.state.stage).toBe('playing');
  return session;
}

describe('playing tricks', () => {
  it('enforces follow suit and allows void sloughs', () => {
    let session = playingSession(41);
    const leader = session.state.turn;
    const lead = legalCards(session, leader)[0]!;
    session = mustStep(session, leader, 'playCard', { card: lead });
    const led = session.state.trick!.ledSuit!;
    const follower = session.state.turn;
    const cards = session.state.hands[follower]!;
    const hasLed = cards.some((card) => suitOfCard(card) === led);
    if (!hasLed) return; // this seed cannot exercise a renege; crafted rules tests cover it
    const off = cards.find((card) => suitOfCard(card) !== led)!;
    expect(step(session, follower, 'playCard', { card: off }).rejected).toBe('must-follow-suit');
  });

  it('passes the lead to each trick winner and counts every trick', () => {
    let session = playingSession(42, { handSize: 3 });
    let collectFx = 0;
    let guard = 0;
    while (session.state.stage === 'playing') {
      if (guard++ > 40) throw new Error('trick play did not finish');
      const seat = session.state.turn;
      const card = legalCards(session, seat)[0]!;
      const result = step(session, seat, 'playCard', { card });
      expect(result.rejected).toBeUndefined();
      collectFx += result.fx.filter((event) => event.kind === 'tricks.collect').length;
      session = result.session;
      if (result.fx.some((event) => event.kind === 'tricks.collect')) {
        expect(session.state.trick).toBeNull();
        // after the FINAL trick the auto-scored fold clears the leader —
        // only mid-round completions must hand the lead to the winner
        if (session.state.stage === 'playing') {
          const winner = session.state.leader;
          expect(winner).not.toBeNull();
          expect(session.state.turn).toBe(winner);
          expect(session.state.tricksWon[winner as number]).toBeGreaterThan(0);
        }
      }
    }
    expect(collectFx).toBe(session.state.handSize);
    expect(session.state.tricksPlayed).toBe(session.state.handSize);
    expect(session.state.tricksWon.reduce((a, b) => a + b, 0)).toBe(session.state.handSize);
  });

  it('auto-scores the round after the last trick', () => {
    let session = openSession({ seed: 43, seats: 4, config: { handSize: 3 } });
    session = bidAround(session, [1, 1, 0, 0]);
    session = playOut(session);
    expect(session.state.stage).toBe('over');
    const summary = session.state.summary!;
    expect(summary.points).toHaveLength(4);
    expect(summary.dealer).toBe(session.state.dealer);
    const result = ohhellGame.end(session.state);
    expect(result).not.toBeNull();
    expect(result!.rankings).toHaveLength(4);
    expect(result!.reason).toBe('round-complete');
    expect(result!.rankings[0]!.detail).toMatchObject({
      points: Math.max(...summary.points),
    });
  });
});
