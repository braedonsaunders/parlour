import { expect, test } from '@playwright/test';

/**
 * The path a first-time player actually walks.
 *
 * Every step here is covered by unit tests in isolation and by nothing at all
 * end to end: the static export booting, the shelf rendering from the registry,
 * the route wipe carrying you to a table, the deal arriving a tick later, and a
 * card accepting a click. A regression in any of them is invisible to jsdom.
 */

test('the title screen boots and offers a game', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('play')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'parlour' })).toBeVisible();
});

test('the shelf lists the games the registry knows', async ({ page }) => {
  await page.goto('/games/');
  // Named rather than counted: a count would pass while showing the wrong ones.
  for (const id of ['blitz', 'wild', 'hearts', 'spades', 'euchre', 'cribbage']) {
    await expect(page.getByTestId(`game-${id}`)).toBeVisible();
  }
});

test('searching the shelf narrows it and can be cleared', async ({ page }) => {
  await page.goto('/games/');
  await page.getByPlaceholder(/search games/i).fill('hearts');
  await expect(page.getByTestId('game-hearts')).toBeVisible();
  await expect(page.getByTestId('game-spades')).toHaveCount(0);

  await page.getByRole('button', { name: /clear game search/i }).click();
  await expect(page.getByTestId('game-spades')).toBeVisible();
});

/**
 * The deal is deferred by a tick so the route wipe keeps its first frame, so
 * "the table renders" and "the table has cards" are genuinely different
 * assertions and only the second one proves the transport was built.
 */
test('a solo table deals and shows a hand', async ({ page }) => {
  await page.goto('/hearts/table/');
  // The rail is the `role="list"` zone the local hand fans into, and a card is
  // a listitem inside it — the same handles a screen reader navigates by.
  const hand = page.locator('[role="list"][data-zone]').first();
  await expect(hand).toBeVisible({ timeout: 15_000 });
  await expect(hand.locator('[role="listitem"]').first()).toBeVisible({ timeout: 15_000 });
});

test('leaving a table returns to its shelf page', async ({ page }) => {
  // Hearts exercises the shared table frame without adding a game-specific
  // result screen to the route home.
  await page.goto('/hearts/table/');
  await expect(page.locator('[role="list"][data-zone] [role="listitem"]').first()).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /table menu/i }).click();
  // Quitting is deliberately two taps — the menu asks before it drops a match.
  await page.getByTestId('quit-to-menu').click();
  await page.getByTestId('confirm-quit').click();
  await expect(page).toHaveURL(/\/hearts\/?$/, { timeout: 15_000 });
});

test.describe('portrait hand rails', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const { game, cards } of [
    { game: 'spades', cards: 13 },
    { game: 'hearts', cards: 13 },
    { game: 'president', cards: 13 },
    { game: 'gin', cards: 10 },
  ] as const) {
    test(`${game} keeps every high-card-count target reachable`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      if (game === 'president') {
        await page.addInitScript(() => {
          localStorage.setItem(
            'parlour.president.setup.v1',
            JSON.stringify({
              state: { mode: 'classic', seats: 4, botTier: 2, overrides: {} },
              version: 1,
            }),
          );
        });
      }

      await page.goto(`/${game}/table/`);
      const hand = page.locator('[role="list"][data-zone^="hand:"]').first();
      await expect(hand.locator('[data-hand-card]')).toHaveCount(cards, { timeout: 15_000 });
      await expect(page.locator('[data-testid$="-rotate-notice"]')).toHaveCount(0);
      await expect(hand).toHaveAttribute('data-scroll-state', 'start');
      await expect(hand.locator('[data-scroll-cue="forward"]')).toHaveCSS('opacity', '1');

      const layout = await hand.evaluate(async (rail) => {
        const track = rail.querySelector<HTMLElement>('[data-hand-scroll]');
        const targets = [
          ...rail.querySelectorAll<HTMLElement>('[data-hand-card] button[data-card-chassis]'),
        ];
        if (!track) throw new Error('hand rail has no scroll track');

        const targetSizes = targets.map((target) => {
          const box = target.getBoundingClientRect();
          return { width: box.width, height: box.height };
        });
        const reachable: boolean[] = [];
        for (const target of targets) {
          target.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const box = target.getBoundingClientRect();
          const viewport = track.getBoundingClientRect();
          reachable.push(box.left >= viewport.left - 1 && box.right <= viewport.right + 1);
        }

        track.scrollLeft = track.scrollWidth;
        track.dispatchEvent(new Event('scroll'));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const last = targets.at(-1)?.getBoundingClientRect();
        const viewport = track.getBoundingClientRect();
        return {
          targetSizes,
          reachable,
          left: track.scrollLeft,
          viewportWidth: track.clientWidth,
          contentWidth: track.scrollWidth,
          lastVisible: Boolean(
            last && last.left >= viewport.left - 1 && last.right <= viewport.right + 1,
          ),
        };
      });

      expect(layout.targetSizes).toHaveLength(cards);
      expect(
        layout.targetSizes.every(({ width, height }) => width >= 44 && height >= 44),
        'every card remains an honest 44px interaction target',
      ).toBe(true);
      expect(layout.contentWidth).toBeGreaterThan(layout.viewportWidth);
      expect(layout.left).toBeGreaterThan(0);
      expect(layout.reachable.every(Boolean), 'every card can be scrolled fully into view').toBe(
        true,
      );
      expect(layout.lastVisible).toBe(true);
      await expect(hand).toHaveAttribute('data-scroll-state', 'end');
    });
  }
});
