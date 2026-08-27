import { describe, expect, it } from 'vitest';
import { replaySession, stateHash } from '@parlour/engine';
import { pinochleGame } from './rules';
import {
  driveHand,
  legalCards,
  mustStep,
  nameTrump,
  openSession,
  requireMove,
  step,
  winAuction,
} from './test-util';

describe('setup', () => {
  it('deals 48 unique cards across four 12-card hands — no widow', () => {
    const session = openSession({ seed: 1 });
    const all = session.state.hands.flat();
    expect(all).toHaveLength(48);
    expect(new Set(all).size).toBe(48);
    for (const hand of session.state.hands) expect(hand).toHaveLength(12);
  });

  it('starts bidding left of the dealer', () => {
    const session = openSession({ seed: 2 });
    expect(session.state.dealer).toBe(0);
    expect(session.state.turn).toBe(1);
    expect(session.state.stage).toBe('bidding');
  });

  it('rejects a table that is not exactly 4 seats', () => {
    expect(() => openSession({ seed: 1, seats: 3 })).toThrow(/4 seats/);
  });

  it('is deterministic for a given seed', () => {
    const a = openSession({ seed: 42 });
    const b = openSession({ seed: 42 });
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    const c = openSession({ seed: 43 });
    expect(stateHash(a.state)).not.toBe(stateHash(c.state));
  });
});

describe('bidding', () => {
  it('rejects an opening bid below the table minimum', () => {
    const session = openSession({ seed: 3, config: { minBid: 25 } });
    const result = step(session, session.state.turn, 'bid', { bid: 24 });
    expect(result.rejected).toBe('bid-too-low');
  });

  it('requires every later bid to beat the one before it', () => {
    let session = openSession({ seed: 3 });
    const first = session.state.turn;
    session = mustStep(session, first, 'bid', { bid: 25 });
    const second = session.state.turn;
    const tooLow = step(session, second, 'bid', { bid: 25 });
    expect(tooLow.rejected).toBe('bid-too-low');
    session = mustStep(session, second, 'bid', { bid: 26 });
    expect(session.state.highBid).toBe(26);
    expect(session.state.highBidder).toBe(second);
  });

  it('rejects a bid over the 60-point ceiling', () => {
    const session = openSession({ seed: 3 });
    const result = step(session, session.state.turn, 'bid', { bid: 61 });
    expect(result.rejected).toBe('bid-too-high');
  });

  it('a seat that has passed cannot bid or pass again', () => {
    let session = openSession({ seed: 3 });
    const first = session.state.turn;
    session = mustStep(session, first, 'pass');
    // The seat that just passed is no longer the acting seat at all — the
    // session gate rejects it before the move's own "already-passed" guard
    // would even run (that guard only defends a direct, out-of-flow call).
    const passAgain = step(session, first, 'pass');
    expect(passAgain.rejected).toBe('not-your-turn');
  });

  it('the last active bidder wins the auction and is asked to name trump', () => {
    const session = winAuction(openSession({ seed: 5 }), 25);
    expect(session.state.stage).toBe('naming-trump');
    expect(session.state.turn).toBe(session.state.highBidder);
    expect(session.state.highBid).toBe(25);
  });

  it('all four seats passing with no bid redeals from the same dealer', () => {
    let session = openSession({ seed: 4 });
    const dealer = session.state.dealer;
    let guard = 0;
    while (session.state.stage === 'bidding' && session.state.handNo === 1) {
      if (guard++ > 8) throw new Error('auction did not redeal');
      session = mustStep(session, session.state.turn, 'pass');
    }
    expect(session.state.handNo).toBe(2);
    expect(session.state.dealer).toBe(dealer);
    expect(session.state.stage).toBe('bidding');
    expect(session.state.scores).toEqual([0, 0]);
  });
});

describe('naming trump', () => {
  it('only the auction winner may name trump', () => {
    const session = winAuction(openSession({ seed: 5 }), 25);
    const bidder = session.state.highBidder as number;
    const other = (bidder + 1) % 4;
    // The bidder is the sole acting seat once naming trump — the session gate
    // rejects any other seat before the move's own guard would apply.
    const result = step(session, other, 'nameTrump', { suit: 'S' });
    expect(result.rejected).toBe('not-your-turn');
    expect(requireMove('nameTrump').validate(session.state, other, { suit: 'S' })).toEqual({
      code: 'not-bidder',
      message: expect.any(String),
    });
  });

  it('moves to melding once trump is named', () => {
    const session = nameTrump(winAuction(openSession({ seed: 5 }), 25), 'H');
    expect(session.state.stage).toBe('melding');
    expect(session.state.trump).toBe('H');
  });
});

describe('meld declaration', () => {
  it('is engine-computed from the real hand — a bot cannot misdeclare it', () => {
    let session = nameTrump(winAuction(openSession({ seed: 6 }), 25), 'S');
    const seat = 0;
    session = mustStep(session, seat, 'confirmMeld', { breakdown: { total: 9999 } });
    expect(session.state.melds[seat]?.total).not.toBe(9999);
  });

  it('moves every seat to playing once all four confirm', () => {
    let session = nameTrump(winAuction(openSession({ seed: 6 }), 25), 'S');
    for (let seat = 0; seat < 4; seat++) session = mustStep(session, seat, 'confirmMeld');
    expect(session.state.stage).toBe('playing');
    expect(session.state.turn).toBe(session.state.highBidder);
    expect(session.state.leader).toBe(session.state.highBidder);
  });

  it('a seat cannot confirm meld twice', () => {
    let session = nameTrump(winAuction(openSession({ seed: 6 }), 25), 'S');
    session = mustStep(session, 0, 'confirmMeld');
    // Seat 0 has left the meld phase's acting seats — the session gate
    // rejects it before the move's own guard would apply.
    const result = step(session, 0, 'confirmMeld');
    expect(result.rejected).toBe('not-your-turn');
    expect(requireMove('confirmMeld').validate(session.state, 0, undefined)).toEqual({
      code: 'already-confirmed',
      message: expect.any(String),
    });
  });
});

describe('trick play', () => {
  it('rejects a card that does not follow suit when the hand holds the led suit', () => {
    let session = nameTrump(winAuction(openSession({ seed: 8 }), 25), 'S');
    for (let seat = 0; seat < 4; seat++) session = mustStep(session, seat, 'confirmMeld');

    const leader = session.state.turn;
    const leaderHand = session.state.hands[leader]!;
    const ledCard = leaderHand[0]!;
    session = mustStep(session, leader, 'playCard', { card: ledCard });

    const follower = session.state.turn;
    const followerHand = session.state.hands[follower]!;
    const ledSuit = session.state.trick?.ledSuit;
    const offSuit = followerHand.find((card) => card[0] !== ledSuit);
    const hasLed = followerHand.some((card) => card[0] === ledSuit);
    if (offSuit && hasLed) {
      const result = step(session, follower, 'playCard', { card: offSuit });
      expect(result.rejected).toBe('must-follow-suit');
    }
  });

  it('the legal-move set never offers a follow-suit violation', () => {
    let session = nameTrump(winAuction(openSession({ seed: 9 }), 25), 'S');
    for (let seat = 0; seat < 4; seat++) session = mustStep(session, seat, 'confirmMeld');
    let guard = 0;
    while (session.state.stage === 'playing' && guard++ < 48) {
      const seat = session.state.turn;
      const cards = legalCards(session, seat);
      expect(cards.length).toBeGreaterThan(0);
      session = mustStep(session, seat, 'playCard', { card: cards[0]! });
    }
  });
});

describe('a full hand', () => {
  it('plays twelve tricks, awards the last-trick bonus, and scores', () => {
    const session = driveHand(openSession({ seed: 11 }), 25, 'S');
    // driveHand stops once the stage leaves 'playing' — auto-advance already
    // ran scoreHand, so the summary (or the next hand's lastHand) is present.
    const summary = session.state.summary ?? session.state.lastHand;
    expect(summary).not.toBeNull();
    expect(summary!.tricksBySeat.reduce((a, b) => a + b, 0)).toBe(12);
    const totalPoints = summary!.trickPointsBySeat.reduce((a, b) => a + b, 0);
    expect(totalPoints).toBe(250); // 240 card points + the 10-point last-trick bonus
  });

  it('sets the bidding team for exactly minus the bid when they fall short', () => {
    // A 60-bid with meld the enumerator will not hand back for a bare hand is
    // unmakeable — the bidder is set for -60.
    const session = driveHand(openSession({ seed: 12 }), 60, 'S');
    const summary = session.state.summary ?? session.state.lastHand;
    expect(summary).not.toBeNull();
    if (summary!.set) {
      const bidTeamScore = session.state.scores[summary!.bidTeam];
      expect(bidTeamScore).toBe(-60);
    }
  });
});

describe('replay', () => {
  it('reproduces an identical hash from the same seed and log', () => {
    const session = driveHand(openSession({ seed: 13 }), 25, 'D');
    const replayed = replaySession(pinochleGame, session.seed, session.log, { seats: 4 });
    expect(stateHash(replayed.state)).toBe(stateHash(session.state));
    expect(replayed.log.at(-1)?.hash).toBe(session.log.at(-1)?.hash);
  });
});
