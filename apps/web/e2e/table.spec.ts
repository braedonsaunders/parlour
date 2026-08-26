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
  // Hearts rather than Spades: Hearts still has no portrait hand rail, so it is
  // the honest case for "leaving a table returns you to its shelf" on a phone.
  // That behaviour has its own test below.
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

test('a four-hand table keeps its full hand reachable on a portrait phone', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'webkit', 'the phone-portrait projects are the WebKit ones');

  await page.goto('/spades/table/');
  const hand = page.locator('[role="list"][data-zone^="hand:"]').first();
  await expect(hand.locator('[data-hand-card]')).toHaveCount(13, { timeout: 15_000 });
  await expect(page.getByTestId('spades-rotate-notice')).toHaveCount(0);
  await expect(hand).toHaveAttribute('data-scroll-state', 'start');

  const targets = await hand.locator('button[data-card-chassis]').evaluateAll((cards) =>
    cards.map((card) => {
      const box = card.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }),
  );
  expect(targets).toHaveLength(13);
  expect(targets.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);

  // Portrait keeps honest card-sized targets and moves the overflow into one
  // deliberate horizontal rail. Prove the far end is reachable rather than
  // merely present beyond the viewport.
  const track = hand.locator('[data-hand-scroll]');
  const scroll = await track.evaluate((rail) => {
    rail.scrollLeft = rail.scrollWidth;
    rail.dispatchEvent(new Event('scroll'));
    return { left: rail.scrollLeft, viewport: rail.clientWidth, content: rail.scrollWidth };
  });
  expect(scroll.content).toBeGreaterThan(scroll.viewport);
  expect(scroll.left).toBeGreaterThan(0);
  await expect(hand).toHaveAttribute('data-scroll-state', 'end');
});
