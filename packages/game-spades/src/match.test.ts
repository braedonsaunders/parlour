import { describe, expect, it } from 'vitest';
import { makeRng } from '@parlour/engine';
import { spadesGame } from './game';
import { matchOver } from './score';
import type { HandSummary, SpadesState } from './state';
import { driveHand, openSession, requireMove } from './test-util';

describe('multi-hand match inside the GameDef', () => {
  it('rotates the dealer and keeps lastHand after auto-advance', () => {
    let session = openSession({ seed: 3_001, config: { targetScore: 750 } });
    expect(session.state.dealer).toBe(0);
    session = driveHand(session, [3, 3, 3, 4]);
    expect(session.state.stage).toBe('bidding');
    expect(session.state.handNo).toBe(2);
    expect(session.state.dealer).toBe(1);
    expect(session.state.lastHand).not.toBeNull();
    expect(session.state.lastHand!.teams[0]!.scoreAfter).toBe(session.state.scores[0]);
    expect(session.state.summary).toBeNull();

    session = driveHand(session, [4, 3, 3, 3]);
    expect(session.state.handNo).toBe(3);
    expect(session.state.dealer).toBe(2);
    expect(session.state.lastHand!.handNo).toBe(2);
  });

  it('ends when a team uniquely reaches the target', () => {
    let session = openSession({ seed: 3_002, config: { targetScore: 250 } });
    let rounds = 0;
    while (session.status === 'playing' && rounds < 40) {
      session = driveHand(session, [4, 3, 3, 3]);
      rounds += 1;
    }
    expect(session.status).toBe('ended');
    expect(session.result).not.toBeNull();
    const scores = session.state.scores;
    expect(matchOver(scores, 250)).not.toBeNull();
  });

  it('continues when both teams sit on the same total at or above target', () => {
    expect(matchOver([500, 500], 500)).toBeNull();
    expect(matchOver([250, 250], 250)).toBeNull();
  });

  it('stateful overtime: [500,500] → [450,480] names a winner', () => {
    const tied = handOverAt([500, 500], true);
    expect(tied.overtime).toBe(true);
    expect(spadesGame.end(tied)).toBeNull();

    const dropped = handOverAt([450, 480], true);
    const result = spadesGame.end(dropped);
    expect(result).not.toBeNull();
    expect(result!.rankings.filter((row) => row.rank === 1).map((row) => row.seat)).toEqual([1, 3]);
  });

  it('stateful overtime: [450,450] continues', () => {
    expect(spadesGame.end(handOverAt([450, 450], true))).toBeNull();
    expect(matchOver([450, 450], 500, true)).toBeNull();
  });

  it('scoreHand persists overtime after a target tie', () => {
    const session = openSession({ seed: 3_003, config: { targetScore: 500, bags: false } });
    const prior: SpadesState = {
      ...session.state,
      scores: [440, 440],
      bags: [0, 0],
      stage: 'playing',
      tricksPlayed: 13,
      tricksBySeat: [3, 4, 3, 3],
      bids: [
        { seat: 0, tricks: 3, nil: false },
        { seat: 1, tricks: 3, nil: false },
        { seat: 2, tricks: 3, nil: false },
        { seat: 3, tricks: 3, nil: false },
      ],
    };
    const after = requireMove('scoreHand').apply(prior, 0, undefined, {
      rng: makeRng(1),
      fx: { emit() {}, events: [] },
      event: { seq: 1 },
    });
    expect(after.scores).toEqual([500, 500]);
    expect(after.overtime).toBe(true);
    expect(spadesGame.end(after)).toBeNull();
  });
});

function handOverAt(scores: readonly [number, number], overtime: boolean): SpadesState {
  const summary = dummySummary(scores);
  return {
    ...openSession({ seed: 3_010, config: { targetScore: 500 } }).state,
    scores,
    overtime,
    stage: 'hand-over',
    summary,
    lastHand: summary,
    lastHandSummary: summary,
  };
}

function dummySummary(scores: readonly [number, number]): HandSummary {
  return {
    handNo: 4,
    dealer: 0,
    bids: [
      { seat: 0, tricks: 3, nil: false },
      { seat: 1, tricks: 3, nil: false },
      { seat: 2, tricks: 3, nil: false },
      { seat: 3, tricks: 4, nil: false },
    ],
    tricksBySeat: [3, 3, 3, 4],
    teams: [
      {
        team: 0,
        contract: 6,
        nonNilTricks: 6,
        nilTricks: 0,
        made: true,
        contractDelta: 60,
        nilDelta: 0,
        overtricks: 0,
        bagsTaken: 0,
        bagPenalty: 0,
        delta: 60,
        scoreAfter: scores[0],
        bagsAfter: 0,
      },
      {
        team: 1,
        contract: 7,
        nonNilTricks: 7,
        nilTricks: 0,
        made: true,
        contractDelta: 70,
        nilDelta: 0,
        overtricks: 0,
        bagsTaken: 0,
        bagPenalty: 0,
        delta: 70,
        scoreAfter: scores[1],
        bagsAfter: 0,
      },
    ],
  };
}
