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
  // Registration is asynchronous, so sampling it once on the frame after
  // navigation is a race the worker loses as the precache grows — this asked
  // whether it had registered *yet*, not whether it registers. The sibling
  // test below always waited; this one now does too.
  const registered = await page
    .waitForFunction(
      async () =>
        'serviceWorker' in navigator && Boolean(await navigator.serviceWorker.getRegistration()),
      null,
      { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false);
  expect(registered).toBe(true);
});

test('a fresh service-worker install does not claim that an update is waiting', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForLoadState('load');

  // Registration itself performs the first script check. A second update call
  // while that install is settling used to queue an identical waiting worker,
  // especially in WebKit, and put a false update toast over the app chrome.
  await page.waitForTimeout(1_500);
  await expect(page.getByTestId('pwa-update-status')).toHaveCount(0);
});

test('a real update toast leaves the table menu hit-testable', async ({ page }) => {
  await page.addInitScript(() => {
    const worker = Object.assign(new EventTarget(), {
      state: 'installing',
      scriptURL: `${location.origin}/sw.js`,
      postMessage: () => undefined,
    });
    const registration = Object.assign(new EventTarget(), {
      active: worker,
      installing: null as typeof worker | null,
      waiting: null as typeof worker | null,
      update: async () => undefined,
    });
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: worker,
      register: async () => {
        window.setTimeout(() => {
          registration.installing = worker;
          registration.dispatchEvent(new Event('updatefound'));
          window.setTimeout(() => {
            worker.state = 'installed';
            worker.dispatchEvent(new Event('statechange'));
          }, 0);
        }, 0);
        return registration;
      },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    });
  });

  await page.goto('/hearts/table/');
  await expect(page.getByTestId('pwa-update-status')).toBeVisible();
  const menu = page.getByRole('button', { name: /table menu/i });
  await expect(menu).toBeVisible();

  const hitIsMenu = await menu.evaluate((button) => {
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit === button || (hit !== null && button.contains(hit));
  });
  expect(hitIsMenu).toBe(true);

  await menu.click();
  await expect(page.getByTestId('table-menu')).toBeVisible();
});

test('a worker already waiting at startup cannot reload a live table', async ({ page }) => {
  await page.addInitScript(() => {
    const boots = Number(window.sessionStorage.getItem('pwa-race-boots') ?? '0') + 1;
    window.sessionStorage.setItem('pwa-race-boots', String(boots));
    const alreadyActivated = window.sessionStorage.getItem('pwa-race-activated') === '1';

    const worker = Object.assign(new EventTarget(), {
      state: 'installed',
      scriptURL: `${location.origin}/sw.js`,
      postMessage: (message: { type?: string }) => {
        if (message.type !== 'SKIP_WAITING') return;
        window.sessionStorage.setItem('pwa-race-activated', '1');
        window.setTimeout(() => serviceWorker.dispatchEvent(new Event('controllerchange')), 0);
      },
    });
    const registration = Object.assign(new EventTarget(), {
      active: worker,
      installing: null as typeof worker | null,
      waiting: alreadyActivated ? null : worker,
      update: async () => undefined,
    });
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: worker,
      register: async () => registration,
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    });
  });

  await page.goto('/wild/table/');
  await expect(page.locator('[data-table-screen]')).toBeVisible();
  await page.waitForTimeout(500);

  expect(await page.evaluate(() => Number(sessionStorage.getItem('pwa-race-boots')))).toBe(1);
  await expect(page.getByTestId('pwa-update-status')).toBeVisible();
});

test('an update armed on a menu waits when the player enters a table route', async ({ page }) => {
  await page.addInitScript(() => {
    const boots = Number(window.sessionStorage.getItem('pwa-route-race-boots') ?? '0') + 1;
    window.sessionStorage.setItem('pwa-route-race-boots', String(boots));
    const alreadyActivated = window.sessionStorage.getItem('pwa-route-race-activated') === '1';

    const worker = Object.assign(new EventTarget(), {
      state: 'installed',
      scriptURL: `${location.origin}/sw.js`,
      postMessage: (message: { type?: string }) => {
        if (message.type !== 'SKIP_WAITING') return;
        window.sessionStorage.setItem('pwa-route-race-activated', '1');
        window.sessionStorage.setItem('pwa-route-race-armed', '1');
      },
    });
    const registration = Object.assign(new EventTarget(), {
      active: worker,
      installing: null as typeof worker | null,
      waiting: alreadyActivated ? null : worker,
      update: async () => undefined,
    });
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: worker,
      register: async () => registration,
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    });
    (
      window as typeof window & { dispatchPwaControllerChangeForTest: () => void }
    ).dispatchPwaControllerChangeForTest = () => {
      serviceWorker.dispatchEvent(new Event('controllerchange'));
    };
  });

  await page.goto('/wild/');
  await page.waitForFunction(() => sessionStorage.getItem('pwa-route-race-armed') === '1');
  await page.evaluate(() => window.history.pushState({}, '', '/wild/table/'));
  await page.evaluate(() =>
    (
      window as typeof window & { dispatchPwaControllerChangeForTest: () => void }
    ).dispatchPwaControllerChangeForTest(),
  );
  await page.waitForTimeout(100);

  expect(await page.evaluate(() => Number(sessionStorage.getItem('pwa-route-race-boots')))).toBe(1);

  const safeScreenReload = page.waitForEvent('load');
  await page.evaluate(() => window.history.pushState({}, '', '/wild/'));
  await safeScreenReload;
  expect(await page.evaluate(() => Number(sessionStorage.getItem('pwa-route-race-boots')))).toBe(2);
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
