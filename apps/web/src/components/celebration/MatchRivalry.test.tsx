import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Rivalry } from '@/lib/match/rivalry';
import { MatchRivalry } from './MatchRivalry';

let container: HTMLDivElement;
let root: Root;

function render(rivalry: Rivalry) {
  act(() => {
    root.render(createElement(MatchRivalry, { rivalry, youName: 'Braedon', youAvatarId: 'ember' }));
  });
}

function text(testId: string): string {
  return container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? '';
}

const DUEL: Rivalry = {
  game: 'blitz',
  sittingGames: 7,
  duel: true,
  standings: [
    {
      key: 'friend:gf',
      name: 'Gf',
      avatarId: 'plum',
      kind: 'friend',
      sitting: { games: 7, wins: 4, losses: 3, ties: 0 },
      allTime: { games: 21, wins: 12, losses: 8, ties: 1 },
    },
  ],
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('MatchRivalry', () => {
  it('leads with the sitting scoreline and who is ahead', () => {
    render(DUEL);
    expect(text('match-rivalry')).toContain('This sitting · 7 games');
    expect(text('rivalry-verdict')).toBe('You lead 4–3');
    expect(text('rivalry-score')).toBe('4–3');
    expect(text('rivalry-alltime')).toBe('All time · 12–8–1 vs Gf · 21 matches');
  });

  it('names the friend when they are the one ahead', () => {
    render({
      ...DUEL,
      standings: [{ ...DUEL.standings[0]!, sitting: { games: 5, wins: 2, losses: 3, ties: 0 } }],
    });
    expect(text('rivalry-verdict')).toBe('Gf leads 3–2');
  });

  it('calls a level series all square', () => {
    render({
      ...DUEL,
      standings: [{ ...DUEL.standings[0]!, sitting: { games: 4, wins: 2, losses: 2, ties: 0 } }],
    });
    expect(text('rivalry-verdict')).toBe('All square at 2–2');
  });

  it('falls back to the all-time record on the first game of a sitting', () => {
    render({ ...DUEL, sittingGames: 1 });
    expect(text('match-rivalry')).toContain('Where you stand');
    expect(text('rivalry-score')).toBe('12–8–1');
    expect(text('rivalry-alltime')).toBe('12–8–1 vs Gf · 21 matches');
  });

  it('lists a row per opponent at a fuller table', () => {
    render({
      game: 'wild',
      sittingGames: 3,
      duel: false,
      standings: [
        DUEL.standings[0]!,
        {
          key: 'bot:slate',
          name: 'Slate',
          avatarId: 'slate',
          kind: 'bot',
          sitting: { games: 3, wins: 3, losses: 0, ties: 0 },
          allTime: { games: 9, wins: 6, losses: 3, ties: 0 },
        },
      ],
    });

    expect(container.querySelectorAll('[data-testid^="rivalry-row-"]')).toHaveLength(2);
    expect(text('rivalry-row-bot:slate')).toContain('3–0');
    expect(text('rivalry-row-bot:slate')).toContain('all time 6–3');
    expect(container.querySelector('[data-testid="rivalry-score"]')).toBeNull();
  });
});
