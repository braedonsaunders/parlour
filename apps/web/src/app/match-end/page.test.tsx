import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchResult } from '@parlour/engine';
import { botKey, buildMatchRecord, friendKey, useHistoryStore } from '@/stores/history';
import { useMatchFlowStore, type MatchSnapshot } from '@/stores/matchFlow';
import MatchEndPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const SEATS = [
  { seat: 0, name: 'Braedon', avatarId: 'ember', kind: 'friend' as const, key: friendKey('me') },
  { seat: 1, name: 'Slate', avatarId: 'slate', kind: 'bot' as const, key: botKey('slate') },
];

function result(localRank: 1 | 2): MatchResult {
  return {
    winner: localRank === 1 ? 0 : 1,
    reason: 'last-one-standing',
    rankings: [
      { seat: 0, rank: localRank },
      { seat: 1, rank: localRank === 1 ? 2 : 1 },
    ],
  };
}

function play(id: string, at: number, localRank: 1 | 2) {
  const record = buildMatchRecord({
    id,
    at,
    game: 'blitz',
    mode: 'classic',
    result: result(localRank),
    localSeat: 0,
    seats: SEATS,
  });
  if (!record) throw new Error('expected a record');
  useHistoryStore.getState().recordMatch(record);
  const snapshot: MatchSnapshot = {
    id,
    result: result(localRank),
    seats: SEATS,
    game: 'blitz',
    mode: 'classic',
    localSeat: 0,
  };
  useMatchFlowStore.getState().setLastMatch(snapshot);
}

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => root.render(createElement(MatchEndPage)));
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    // reduced motion on: the podium's celebration timeline stays out of the way
    value: () => ({ matches: true }),
  });
  useHistoryStore.setState({ records: [] });
  useMatchFlowStore.setState({ lastMatch: null, playAgain: null });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('match end screen', () => {
  it('shows no standings after the first meeting', () => {
    play('m1', 1_000, 1);
    render();
    expect(container.querySelector('[data-testid="match-podium"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="match-rivalry"]')).toBeNull();
  });

  it('shows the running series once the same players go again', () => {
    play('m1', 1_000, 1);
    play('m2', 2_000, 1);
    play('m3', 3_000, 2);
    render();
    expect(container.querySelector('[data-testid="match-rivalry"]')?.textContent).toContain(
      'This sitting · 3 games',
    );
    expect(container.querySelector('[data-testid="rivalry-verdict"]')?.textContent).toBe(
      'You lead 2–1',
    );
  });
});
