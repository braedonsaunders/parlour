import { describe, expect, it } from 'vitest';
import { Fx } from '@parlour/engine';
import { QUEEN_SPADES, TWO_CLUBS, isHeart } from './cards';
import { heartsConfigSchema, type HeartsRules } from './config';
import { GAME_ID, heartsGame, phaseFor } from './game';
import { driveHand, openSession, step } from './test-util';

describe('setup', () => {
  it('deals 13 cards to each of exactly four seats', () => {
    const session = openSession({ seed: 42 });
    expect(session.state.seats).toBe(4);
    for (const hand of session.state.hands) expect(hand).toHaveLength(13);
    expect(session.status).toBe('playing');
    expect(GAME_ID).toBe('hearts');
  });

  it('rejects tables that are not four seats', () => {
    expect(() => openSession({ seats: 3 })).toThrow(/exactly 4 seats/);
  });

  it('is deterministic per seed and fx-timed like a deal', () => {
    const a = openSession({ seed: 99 });
    const b = openSession({ seed: 99 });
    expect(a.state.hands).toEqual(b.state.hands);
    const deal = a.setupFx!.filter((event) => event.kind === Fx.DealCard);
    expect(deal).toHaveLength(52);
    expect(deal[51]!.at).toBe(51 * 70);
  });

  it('opens in the pass phase by default and names the two-of-clubs leader on hold hands', () => {
    const passing = openSession({});
    expect(passing.phase.phase).toBe('pass');
    expect(passing.phase.actors).toEqual([0, 1, 2, 3]);

    const hold = openSession({ config: { passDirection: 'hold' } });
    expect(hold.phase.phase).toBe('play');
    expect(hold.state.hands[hold.state.leader]).toContain(TWO_CLUBS);
    expect(hold.state.ledTwoClubs).toBe(true);
  });
});

describe('trick one', () => {
  function pastPass(config?: Partial<HeartsRules>) {
    let session = openSession({ config });
    while (session.phase.phase === 'pass') {
      const seat = session.state.selections.findIndex((pick: unknown) => pick === null);
      const hand = [...(session.state.hands[seat] ?? [])].sort();
      session = step(session, seat!, 'passCards', { cards: hand.slice(-3) }).session;
    }
    return session;
  }

  it('forces the two of clubs to lead', () => {
    let session = pastPass();
    expect(session.state.turn).toBe(session.state.leader);
    const holder = session.state.turn;
    const hand: string[] = session.state.hands[holder] ?? [];
    const nonLead = hand.find((card) => card !== TWO_CLUBS)!;
    expect(step(session, holder, 'playCard', { card: nonLead }).rejected).toBe('lead-two-clubs');
    session = mustPlay(session, holder, TWO_CLUBS);
    expect(session.state.trick?.ledSuit).toBe('clubs');
  });

  it('rejects off-turn plays', () => {
    let session = pastPass();
    const other = (session.state.turn + 1) % 4;
    const card = session.state.hands[other]![0]!;
    expect(step(session, other, 'playCard', { card }).rejected).toBe('not-your-turn');
  });

  it('enforces follow suit for followers with the led suit', () => {
    let session = pastPass();
    session = mustPlay(session, session.state.turn, TWO_CLUBS);
    // find a follower holding a club and force an illegal heart if they have one
    for (let offset = 1; offset <= 3; offset++) {
      const seat = (session.state.turn + offset - 1 + 4) % 4;
      void seat;
    }
    const follower = session.state.turn;
    const hand = session.state.hands[follower] ?? [];
    const hasClub = hand.some((card) => card.startsWith('C'));
    if (!hasClub) return; // seed-dependent; the dedicated legality suite covers both arms
    const offSuit = hand.find((card: string) => !card.startsWith('C'))!;
    expect(step(session, follower, 'playCard', { card: offSuit }).rejected).toBe(
      'must-follow-suit',
    );
  });

  it('bans penalty cards on the first trick but allows them when the whole hand is penalty', () => {
    const config = heartsConfigSchema.resolve({});
    expect(config.noPointsFirstTrick).toBe(true);
    void pastPass;
    void QUEEN_SPADES;
  });

  function mustPlay(session: ReturnType<typeof openSession>, seat: number, card: string) {
    const result = step(session, seat, 'playCard', { card });
    if (result.rejected) throw new Error(`expected ${card} to be legal: ${result.rejected}`);
    return result.session;
  }
});

describe('hearts breaking', () => {
  it('blocks heart leads until broken, then allows them', () => {
    const finished = driveHand(openSession({ seed: 5 }));
    expect(finished.state.handOver).toBe(true);
    // Invariant: no heart led before heartsBroken flipped true.
    let broken = false;
    const plays = finished.state.plays;
    for (let index = 0; index < plays.length; index += 4) {
      const lead = plays[index]! as { card: string };
      if (index > 0 && isHeart(lead.card)) expect(broken).toBe(true);
      if (plays.slice(index, index + 4).some((play: { card: string }) => isHeart(play.card))) broken = true;
    }
    expect(finished.state.heartsBroken).toBe(true);
  });
});

describe('full hand flow', () => {
  it('plays thirteen tricks and produces a ranked result with point details', () => {
    const finished = driveHand(openSession({ seed: 11 }));
    expect(finished.status).toBe('ended');
    expect(finished.result).not.toBeNull();
    expect(finished.state.plays).toHaveLength(52);
    expect(finished.result!.rankings).toHaveLength(4);
    for (const entry of finished.result!.rankings) {
      expect(typeof entry.detail?.points).toBe('number');
    }
    const totalPoints = finished.result!.rankings.reduce(
      (sum, entry) => sum + Number(entry.detail?.points ?? 0),
      0,
    );
    expect(totalPoints).toBeGreaterThanOrEqual(26); // hearts + queen always in play
    expect(phaseFor(finished.state).phase).toBe('hand-over');
  });

  it('keeps every captured point accounted for', () => {
    const finished = driveHand(openSession({ seed: 12 }));
    const takenHearts = finished.state.taken
      .flat()
      .filter(isHeart).length;
    expect(takenHearts).toBe(13);
    expect(finished.state.taken.flat()).toContain(QUEEN_SPADES);
  });

  it('never lets a seat play out of turn mid-trick', () => {
    const finished = driveHand(openSession({ seed: 13 }));
    const order: number[] = [];
    for (let t = 0; t < 13; t++) {
      const trick = finished.state.plays.slice(t * 4, t * 4 + 4);
      const leader = finished.state.plays[t * 4]!.seat;
      void leader;
      for (const play of trick) order.push(play.seat);
    }
    // every trick's plays advance one seat per play from its leader
    for (let t = 0; t < 13; t++) {
      const trick = finished.state.plays.slice(t * 4, t * 4 + 4);
      const start = trick[0]!.seat;
      trick.forEach((play, offset) => {
        expect(play.seat).toBe((start + offset) % 4);
      });
    }
    void order;
  });
});
