import { expect, test } from '@playwright/test';

/**
 * The install path, in a real browser.
 *
 * The PWA is how most players will actually keep parlour, and none of it is
 * observable from jsdom: there is no service worker, no manifest fetch, and no
 * `beforeinstallprompt`. A manifest that stops parsing or a worker that stops
 * registering breaks installation silently — the app keeps working in a tab,
 * so nothing else notices.
 */

test('the manifest is served and describes an installable app', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);

  const manifest = await response.json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.start_url).toBeTruthy();
  expect(manifest.display).toBe('standalone');
  expect(Array.isArray(manifest.icons)).toBe(true);
  expect(manifest.icons.length).toBeGreaterThan(0);

  // An installable manifest needs a 192 and a 512; a missing one is the classic
  // "why is the install button greyed out" bug.
  const sizes = manifest.icons.map((icon: { sizes?: string }) => icon.sizes ?? '');
  expect(sizes.some((size: string) => size.includes('192'))).toBe(true);
  expect(sizes.some((size: string) => size.includes('512'))).toBe(true);
});

test('the service worker is served and registers', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit blocks service workers on plain http origins');

  await page.goto('/');
  const registered = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(registration);
  });
  expect(registered).toBe(true);
});

test('the offline shell is cached after a first visit', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit blocks service workers on plain http origins');

  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, {
    timeout: 20_000,
  });

  await context.setOffline(true);
  await page.reload();
  // The point of the worker: the title screen still comes up with no network.
  await expect(page.getByTestId('play')).toBeVisible({ timeout: 15_000 });
  await context.setOffline(false);
});

test('iOS is told how to install, since it has no install prompt', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'webkit', 'this is the iOS-only instructions path');

  await page.goto('/');
  const install = page.getByRole('button', { name: /add to home screen|install/i });
  await expect(install).toBeVisible();
  await install.click();
  await expect(page.getByText(/tap share in your browser toolbar/i)).toBeVisible();
});
