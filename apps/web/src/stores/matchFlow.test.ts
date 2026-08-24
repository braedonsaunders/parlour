import { beforeEach, describe, expect, it } from 'vitest';
import type { MatchResult } from '@parlour/engine';
import { botKey, friendKey } from './history';
import { MATCH_FLOW_STORAGE_KEY, useMatchFlowStore, type MatchSnapshot } from './matchFlow';

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
    sessionStorage.clear();
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

  it('keeps the finished match in session storage so the podium survives a reload', () => {
    useMatchFlowStore.getState().setLastMatch(SNAPSHOT);

    // A hard navigation, an iOS tab discard under memory pressure or a plain
    // refresh all rebuild the module graph. Anything the podium needs has to
    // come back off storage, or the player who just won is told there is no
    // match on record.
    const persisted = JSON.parse(sessionStorage.getItem(MATCH_FLOW_STORAGE_KEY) ?? '{}');
    expect(persisted.state.lastMatch.id).toBe('match-1');
    expect(persisted.state.lastMatch.game).toBe('blitz');
    expect(persisted.state.lastMatch.result.winner).toBe(1);
    expect(persisted.state.lastMatch.seats).toHaveLength(2);
  });

  it('does not try to persist the play-again closure', () => {
    useMatchFlowStore.getState().setLastMatch(SNAPSHOT);
    useMatchFlowStore.getState().registerPlayAgain(() => {});

    const persisted = JSON.parse(sessionStorage.getItem(MATCH_FLOW_STORAGE_KEY) ?? '{}');
    expect(persisted.state).not.toHaveProperty('playAgain');
  });

  it('rehydrates a stored match into a fresh store', async () => {
    useMatchFlowStore.getState().setLastMatch(SNAPSHOT);
    // What the next document would find in storage. Reset through storage
    // rather than setState, which would persist the empty state over it.
    const written = sessionStorage.getItem(MATCH_FLOW_STORAGE_KEY)!;
    useMatchFlowStore.setState({ lastMatch: null });
    sessionStorage.setItem(MATCH_FLOW_STORAGE_KEY, written);

    await useMatchFlowStore.persist.rehydrate();

    expect(useMatchFlowStore.getState().lastMatch?.id).toBe('match-1');
    expect(useMatchFlowStore.getState().lastMatch?.game).toBe('blitz');
  });
});
