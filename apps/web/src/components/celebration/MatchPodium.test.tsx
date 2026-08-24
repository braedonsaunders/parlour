import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MatchSnapshot } from '@/stores/matchFlow';
import { MatchPodium } from './MatchPodium';

const SEATS = [
  { seat: 0, name: 'Braedon', avatarId: 'ember', kind: 'friend' as const, key: 'friend:me' },
  { seat: 1, name: 'Slate', avatarId: 'slate', kind: 'bot' as const, key: 'bot:slate' },
];

function snapshot(winner: 0 | 1): MatchSnapshot {
  return {
    game: 'blitz',
    mode: 'classic',
    localSeat: 0,
    seats: SEATS,
    result: {
      winner,
      reason: 'last-one-standing',
      rankings: [
        { seat: winner, rank: 1 },
        { seat: winner === 0 ? 1 : 0, rank: 2 },
      ],
    },
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: true }),
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('MatchPodium result copy', () => {
  it('uses second-person grammar when the local player wins', () => {
    act(() => root.render(createElement(MatchPodium, { snapshot: snapshot(0) })));
    expect(container.querySelector('h1')?.textContent).toBe('You won the match');
  });

  it('names an opponent who wins', () => {
    act(() => root.render(createElement(MatchPodium, { snapshot: snapshot(1) })));
    expect(container.querySelector('h1')?.textContent).toBe('Slate won the match');
  });
});
