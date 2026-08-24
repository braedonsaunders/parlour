import { describe, expect, it } from 'vitest';
import { Fx } from '@parlour/engine';
import { followError, resolveTrickWinner } from '@parlour/tricks';
import { HAND_SIZE, SPADES_SEATS, isSpade, rankOfCard, spadesTrickRules, suitOfCard } from './cards';
import { GAME_ID, SpadesFx, createSpadesDef } from './game';
import { bidAround, driveHand, legalCards, mustStep, openSession, step } from './test-util';
import { spadesConfig } from './config';

describe('setup', () => {
  it('deals 13 unique cards to each of exactly four seats', () => {
    const session = openSession({ seed: 42 });
    expect(session.state.hands).toHaveLength(SPADES_SEATS);
    const all = session.state.hands.flat();
    expect(all).toHaveLength(52);
    expect(new Set(all).size).toBe(52);
    for (const hand of session.state.hands) expect(hand).toHaveLength(HAND_SIZE);
    expect(GAME_ID).toBe('spades');
    expect(session.phase.phase).toBe('bidding');
    expect(session.state.dealer).toBe(0);
    expect(session.state.turn).toBe(1);
  });

  it('rejects tables that are not four seats', () => {
    expect(() => openSession({ seats: 3 })).toThrow(/exactly 4 seats/);
  });

  it('is deterministic per seed and emits a staggered deal', () => {
    const a = openSession({ seed: 99 });
    const b = openSession({ seed: 99 });
    expect(a.state.hands).toEqual(b.state.hands);
    const deal = a.setupFx!.filter((event) => event.kind === Fx.DealCard);
    expect(deal).toHaveLength(52);
    expect(deal[51]!.at).toBe(51 * 65);
  });
});

describe('bidding', () => {
  it('takes one immutable bid per seat, clockwise from left of dealer', () => {
    let session = openSession({ seed: 1 });
    expect(session.state.turn).toBe(1);
    expect(step(session, 0, 'bid', { bid: 3 }).rejected).toBe('not-your-turn');
    session = mustStep(session, 1, 'bid', { bid: 3 });
    expect(session.state.turn).toBe(2);
    expect(step(session, 1, 'bid', { bid: 4 }).rejected).toBe('not-your-turn');
    session = mustStep(session, 2, 'bid', { bid: 4 });
    session = mustStep(session, 3, 'bid', { bid: 2 });
    session = mustStep(session, 0, 'bid', { bid: 3 });
    expect(session.state.stage).toBe('playing');
    expect(session.state.bids.map((bid) => bid?.tricks)).toEqual([3, 3, 4, 2]);
  });

  it('rejects bid 0 and requires bidNil for nil', () => {
    const session = openSession({ seed: 2 });
    const seat = session.state.turn;
    expect(step(session, seat, 'bid', { bid: 0 }).rejected).toBe('bad-bid');
    expect(step(session, seat, 'bid', { bid: 14 }).rejected).toBe('bad-bid');
    const nilled = mustStep(session, seat, 'bidNil');
    expect(nilled.state.bids[seat]).toEqual({ seat, tricks: 0, nil: true });
  });

  it('makes bidNil illegal when nil is off — legal bids are 1..13', () => {
    const session = openSession({ seed: 3, config: { nil: false } });
    const seat = session.state.turn;
    expect(step(session, seat, 'bidNil').rejected).toBe('nil-disabled');
    const legal = createSpadesDef().flow.legalMovesFor?.(session.state, session.phase, seat) ?? [];
    expect(legal.some((move) => move.id === 'bidNil')).toBe(false);
    expect(legal.map((move) => (move.payload as { bid?: number }).bid)).toEqual(
      Array.from({ length: 13 }, (_, i) => i + 1),
    );
  });

  it('starts play after four bids from left of dealer', () => {
    const session = bidAround(openSession({ seed: 4 }), [3, 4, 3, 2]);
    expect(session.state.stage).toBe('playing');
    expect(session.state.leader).toBe(1);
    expect(session.state.turn).toBe(1);
  });
});

describe('follow-suit and trump', () => {
  it('rejects a renege and lets a void slough anything', () => {
    const rules = spadesTrickRules();
    expect(followError({ ledSuit: 'hearts', hand: ['H3', 'S1'], card: 'S1' }, rules)).toBe(
      'must-follow-suit',
    );
    expect(followError({ ledSuit: 'hearts', hand: ['C3', 'S1'], card: 'S1' }, rules)).toBeNull();
    expect(rankOfCard('S1')).toBe(14);
    expect(rankOfCard('S13')).toBe(13);
  });

  it('ace of spades beats a king of the led suit', () => {
    const rules = spadesTrickRules();
    expect(
      resolveTrickWinner(
        {
          leader: 0,
          plays: [
            { seat: 0, card: 'H13' },
            { seat: 1, card: 'S1' },
            { seat: 2, card: 'H12' },
            { seat: 3, card: 'H2' },
          ],
          ledSuit: 'hearts',
        },
        rules,
      ),
    ).toBe(1);
  });

  it('enforces follow-suit on a live dealt hand', () => {
    let session = bidAround(openSession({ seed: 11 }), [3, 3, 3, 3]);
    const leader = session.state.turn;
    const lead =
      legalCards(session, leader).find((card) => !isSpade(card)) ?? legalCards(session, leader)[0]!;
    session = mustStep(session, leader, 'playCard', { card: lead });
    const follower = session.state.turn;
    const hand = session.state.hands[follower] ?? [];
    const led = suitOfCard(lead);
    const hasLed = hand.some((card) => suitOfCard(card) === led);
    if (!hasLed) return;
    const off = hand.find((card) => suitOfCard(card) !== led)!;
    expect(step(session, follower, 'playCard', { card: off }).rejected).toBe('must-follow-suit');
  });
});

describe('broken-spades lead rule', () => {
  it('rejects a premature spade lead when the hand still holds a side suit', () => {
    const session = bidAround(openSession({ seed: 21 }), [3, 3, 3, 3]);
    const seat = session.state.turn;
    const spade = (session.state.hands[seat] ?? []).find(isSpade);
    const side = (session.state.hands[seat] ?? []).find((card) => !isSpade(card));
    if (!spade || !side) return;
    expect(session.state.spadesBroken).toBe(false);
    expect(step(session, seat, 'playCard', { card: spade }).rejected).toBe('spades-not-broken');
  });

  it('allows an all-spades lead and rejects a mixed-hand spade lead', () => {
    const def = createSpadesDef();
    const base = {
      ...openSession({ seed: 1 }).state,
      stage: 'playing' as const,
      turn: 0,
      leader: 0,
      trick: null,
      spadesBroken: false,
      veiled: false,
    };
    expect(def.moves.playCard.validate({ ...base, hands: [['S1', 'S2', 'S3'], ['H2'], ['D2'], ['C2']] }, 0, { card: 'S1' })).toBe(true);
    expect(
      def.moves.playCard.validate({ ...base, hands: [['S1', 'H2'], ['H3'], ['D2'], ['C2']] }, 0, {
        card: 'S1',
      }),
    ).not.toBe(true);
  });
});

describe('a finished hand', () => {
  it('plays exactly 13 tricks, scores, and keeps lastHand after auto-advance', () => {
    const session = driveHand(openSession({ seed: 33, config: { targetScore: 750 } }), [3, 3, 3, 4]);
    expect(session.state.lastHand!.tricksBySeat.reduce((a, b) => a + b, 0)).toBe(13);
    expect(session.state.lastHand).not.toBeNull();
    expect(session.state.lastHandSummary).toBe(session.state.lastHand);
    expect(session.state.lastHand!.teams).toHaveLength(2);
    expect(session.state.stage).toBe('bidding');
    expect(session.state.handNo).toBe(2);
    expect(session.state.dealer).toBe(1);
    expect(session.state.turn).toBe(2);
  });

  it('emits namespaced score FX on the completing play', () => {
    let session = bidAround(openSession({ seed: 34, config: { targetScore: 750 } }), [3, 3, 3, 4]);
    let lastFx: { kind: string }[] = [];
    while (session.state.stage === 'playing') {
      const seat = session.state.turn;
      const card = legalCards(session, seat)[0]!;
      const result = step(session, seat, 'playCard', { card });
      if (result.rejected) throw new Error(result.rejected);
      session = result.session;
      lastFx = result.fx;
    }
    const kinds = lastFx.map((event) => event.kind);
    expect(kinds).toContain(SpadesFx.HandScore);
    expect(kinds).toContain(SpadesFx.ScoreChip);
    expect(kinds).toContain('tricks.collect');
    expect(kinds).toContain(SpadesFx.TrickCollect);
  });
});

describe('catalog presets', () => {
  it('exposes classic / quick / clean-books', () => {
    expect(spadesConfig.presets.map((preset) => preset.id)).toEqual([
      'classic',
      'quick',
      'clean-books',
    ]);
    expect(spadesConfig.resolve({}).targetScore).toBe(500);
    expect(spadesConfig.resolve({ targetScore: 250 }).targetScore).toBe(250);
    expect(spadesConfig.resolve({ bags: false }).bags).toBe(false);
  });
});
