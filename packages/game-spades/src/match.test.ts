import { describe, expect, it } from 'vitest';
import { driveHand, openSession } from './test-util';
import { matchOver } from './score';

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
});
