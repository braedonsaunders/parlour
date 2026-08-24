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
  // Hearts rather than Spades: Spades asks a phone to rotate before it deals,
  // so on the WebKit project its table is deliberately unreachable in portrait.
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

test('a four-hand table asks a portrait phone to turn sideways', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'the phone-portrait projects are the WebKit ones');

  // Thirteen cards across four seats does not fit a portrait phone, so Spades
  // covers the table rather than dealing something unreadable. Worth pinning:
  // this is the one screen whose whole job is to be in the way.
  await page.goto('/spades/table/');
  await expect(page.getByTestId('spades-rotate-notice')).toBeVisible({ timeout: 15_000 });
});
