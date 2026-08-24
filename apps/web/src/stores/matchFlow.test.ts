import { beforeEach, describe, expect, it } from 'vitest';
import type { MatchResult } from '@parlour/engine';
import { botKey, friendKey } from './history';
import { useMatchFlowStore, type MatchSnapshot } from './matchFlow';

const SNAPSHOT: MatchSnapshot = {
  result: {
    winner: 1,
    reason: 'last-one-standing',
    rankings: [
      { seat: 1, rank: 1 },
      { seat: 0, rank: 2 },
    ],
  } satisfies MatchResult,
  seats: [
    { seat: 0, name: 'You', avatarId: 'ember', kind: 'friend', key: friendKey('me') },
    { seat: 1, name: 'Juniper', avatarId: 'juniper', kind: 'bot', key: botKey('juniper') },
  ],
  id: 'match-1',
  game: 'blitz',
  mode: 'classic',
  localSeat: 0,
};

describe('matchFlow store', () => {
  beforeEach(() => {
    useMatchFlowStore.getState().setLastMatch(null as never);
    useMatchFlowStore.getState().registerPlayAgain(null);
  });

  it('starts empty so direct navigation sees the honest no-match state', () => {
    expect(useMatchFlowStore.getState().lastMatch).toBeNull();
    expect(useMatchFlowStore.getState().playAgain).toBeNull();
  });

  it('stores the finished match snapshot', () => {
    useMatchFlowStore.getState().setLastMatch(SNAPSHOT);
    expect(useMatchFlowStore.getState().lastMatch?.result.winner).toBe(1);
  });

  it('routes Play Again through the table-registered handler when present', () => {
    let called = 0;
    useMatchFlowStore.getState().registerPlayAgain(() => {
      called += 1;
    });
    const handler = useMatchFlowStore.getState().playAgain;
    expect(handler).not.toBeNull();
    handler?.();
    expect(called).toBe(1);
  });
});
