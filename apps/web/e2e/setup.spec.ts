import { expect, test } from '@playwright/test';

/**
 * The table you set up is the table you get back.
 *
 * Setup choices used to live in memory only, so anything that reloaded the
 * document dealt the shipped defaults instead: pick two seats at Wild, let the
 * installed app relaunch on the table route, and three bots would sit down.
 * jsdom cannot see this — it needs a real document that really goes away.
 */

const seatCount = (page: import('@playwright/test').Page) => page.locator('[data-seat]').count();

test('a chosen seat count survives a reload at the table', async ({ page }) => {
  await page.goto('/wild/');
  await page.getByRole('group', { name: 'Seats' }).getByRole('button', { name: '2' }).click();
  await page.getByTestId('deal-me-in').click();

  await expect(page).toHaveURL(/\/wild\/table\/?$/, { timeout: 15_000 });
  await expect.poll(() => seatCount(page), { timeout: 15_000 }).toBe(2);

  await page.reload();
  await expect.poll(() => seatCount(page), { timeout: 15_000 }).toBe(2);
});

test('the setup screen reopens on the table you last picked', async ({ page }) => {
  await page.goto('/wild/');
  await page.getByRole('group', { name: 'Seats' }).getByRole('button', { name: '3' }).click();
  await expect(page.getByRole('button', { name: '3' })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/wild/');
  await expect(page.getByRole('button', { name: '3' })).toHaveAttribute('aria-pressed', 'true');
});
