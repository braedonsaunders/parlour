import { act } from 'react';
import { GAMES } from '@/lib/games';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMenuNavForTests } from '@/stores/menuNav';
import GameSelectPage from './page';

// Read from the registry rather than a literal: shipping a game should not
// mean editing a count in a test that is not about counting.
const SHELF_SIZE = GAMES.length;

const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

let container: HTMLDivElement;
let root: Root;

function gameTiles(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[data-testid^="game-"]'));
}

function searchFor(value: string) {
  const input = container.querySelector<HTMLInputElement>('#game-search');
  if (!input) throw new Error('game search input missing');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setValue) throw new Error('input value setter missing');

  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  resetMenuNavForTests();
  router.push.mockReset();
  router.prefetch.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<GameSelectPage />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('game library', () => {
  it('starts with every game and an accessible catalog search', () => {
    const input = container.querySelector<HTMLInputElement>('#game-search');

    expect(input?.type).toBe('search');
    expect(container.querySelector('label[for="game-search"]')?.textContent).toBe('Search games');
    expect(gameTiles()).toHaveLength(SHELF_SIZE);
    expect(container.textContent).toContain(`${SHELF_SIZE} games ready to play`);
  });

  it('filters instantly across catalog metadata and keeps selection working', () => {
    searchFor('rummy');

    expect(gameTiles().map((tile) => tile.dataset.testid)).toEqual(['game-gin']);
    expect(container.textContent).toContain('1 game found');

    act(() => gameTiles()[0]!.click());
    expect(router.push).toHaveBeenCalledWith('/gin');
  });

  it('clears a query and restores the complete shelf', () => {
    searchFor('shedding');
    expect(gameTiles().map((tile) => tile.dataset.testid)).toEqual(['game-wild']);

    const clear = container.querySelector<HTMLButtonElement>('[aria-label="Clear game search"]');
    act(() => clear?.click());

    expect(gameTiles()).toHaveLength(SHELF_SIZE);
    expect(container.textContent).toContain(`${SHELF_SIZE} games ready to play`);
  });

  it('offers a friendly recovery when no game matches', () => {
    searchFor('bridge');

    expect(gameTiles()).toHaveLength(0);
    expect(container.querySelector('[data-testid="game-search-empty"]')?.getAttribute('role')).toBe(
      'status',
    );
    expect(container.textContent).toContain('No game on the shelf matches “bridge”');
  });
});
