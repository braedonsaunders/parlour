import { expect, test, type Locator, type Page } from '@playwright/test';

type AnnouncementWindow = Window & {
  __parlourAnnouncements?: string[];
  __parlourLastAnnouncement?: string;
};

function tabKey(browserName: string, reverse = false): string {
  const modifier = browserName === 'webkit' ? 'Alt+' : '';
  return `${modifier}${reverse ? 'Shift+' : ''}Tab`;
}

async function pressTab(page: Page, browserName: string, reverse = false) {
  await page.keyboard.press(tabKey(browserName, reverse));
}

async function tabTo(page: Page, target: Locator, browserName: string) {
  await target.waitFor({ state: 'visible' });
  for (let press = 0; press < 120; press += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await pressTab(page, browserName);
  }
  throw new Error(`keyboard focus never reached ${await target.toString()}`);
}

async function arrowTo(page: Page, target: Locator, key: 'ArrowLeft' | 'ArrowRight') {
  await target.waitFor({ state: 'visible' });
  for (let press = 0; press < 40; press += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  throw new Error(`arrow-key focus never reached ${await target.toString()}`);
}

async function installAnnouncementRecorder(page: Page) {
  await page.addInitScript(() => {
    const state = window as AnnouncementWindow;
    state.__parlourAnnouncements = [];
    state.__parlourLastAnnouncement = '';

    const record = () => {
      const text =
        document.querySelector<HTMLElement>('[data-table-announcer]')?.textContent?.trim() ?? '';
      if (text && text !== state.__parlourLastAnnouncement) {
        state.__parlourAnnouncements?.push(text);
      }
      state.__parlourLastAnnouncement = text;
    };

    new MutationObserver(record).observe(document, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
}

async function resetAnnouncements(page: Page) {
  await page.evaluate(() => {
    const state = window as AnnouncementWindow;
    state.__parlourAnnouncements = [];
    state.__parlourLastAnnouncement =
      document.querySelector<HTMLElement>('[data-table-announcer]')?.textContent?.trim() ?? '';
  });
}

async function announcements(page: Page): Promise<string[]> {
  return page.evaluate(() => [...((window as AnnouncementWindow).__parlourAnnouncements ?? [])]);
}

test('a player can move a Klondike card to its foundation with only the keyboard', async ({
  page,
  browserName,
}) => {
  test.setTimeout(45_000);
  await installAnnouncementRecorder(page);
  await page.addInitScript(() => {
    const nativeGetRandomValues = Crypto.prototype.getRandomValues;
    Crypto.prototype.getRandomValues = function getRandomValues<T extends ArrayBufferView | null>(
      array: T,
    ): T {
      if (array instanceof Int32Array && array.length === 1) {
        array[0] = 1;
        return array;
      }
      return nativeGetRandomValues.call(this, array as never) as T;
    };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/klondike/');

  const relaxed = page.getByTestId('klondike-relaxed');
  await tabTo(page, relaxed, browserName);
  await page.keyboard.press('Enter');
  await expect(relaxed).toHaveAttribute('aria-checked', 'true');

  const winnableOnly = page.getByTestId('klondike-winnable-only');
  await tabTo(page, winnableOnly, browserName);
  await expect(winnableOnly).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Enter');
  await expect(winnableOnly).toHaveAttribute('aria-checked', 'false');

  const start = page.getByTestId('start-klondike');
  await tabTo(page, start, browserName);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/klondike\/table\/?$/, { timeout: 15_000 });

  const source = page.locator('[data-zone="tableau:3"] [data-card="D1"] button');
  const target = page.locator('[data-zone="foundation:diamonds"] button');
  const announcer = page.locator('[data-table-announcer]');
  await expect(source).toBeVisible({ timeout: 15_000 });
  await expect(announcer).toHaveText('');
  expect(await announcements(page), 'the opening deal must not flood the live region').toEqual([]);

  await resetAnnouncements(page);
  await tabTo(page, source, browserName);
  await page.keyboard.press('Enter');
  await expect(target).toBeEnabled();
  await arrowTo(page, target, 'ArrowLeft');
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-zone="foundation:diamonds"] [data-card="D1"]')).toBeVisible();
  await expect.poll(() => announcements(page)).toHaveLength(1);
  await page.waitForTimeout(250);
  const [announcement] = await announcements(page);
  expect(announcement).toMatch(
    /ace of diamonds moved from tableau column 4 to the diamonds foundation\. 2 of diamonds revealed in tableau column 4\./i,
  );
  await expect(announcer).toHaveText(announcement!);
});

test('a player can bid and play a Spades card with only the keyboard', async ({
  page,
  browserName,
}) => {
  test.setTimeout(45_000);
  await installAnnouncementRecorder(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/spades/table/');

  const bidOne = page.locator('[data-testid="spades-bid"][data-bid="1"]');
  const bidTwo = page.locator('[data-testid="spades-bid"][data-bid="2"]');
  await expect(bidOne).toBeVisible({ timeout: 15_000 });
  await resetAnnouncements(page);
  await tabTo(page, bidOne, browserName);
  await page.keyboard.press('ArrowRight');
  await expect(bidTwo).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('spades-bid-rail')).toHaveCount(0);

  await expect.poll(() => announcements(page)).toHaveLength(1);
  await page.waitForTimeout(300);
  const turnAnnouncements = await announcements(page);
  expect(turnAnnouncements).toHaveLength(1);
  expect(turnAnnouncements[0]).toMatch(/Seat 2.+turn/i);

  const hand = page.locator('[role="list"][data-zone^="hand:"]').first();
  const playableCards = hand.locator('button[data-card-chassis]:not(:disabled)');
  await expect(playableCards.first()).toBeVisible({ timeout: 15_000 });
  await expect(hand.locator('[data-hand-card]')).toHaveCount(13);

  await tabTo(page, hand, browserName);
  await expect(hand).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const firstPlayable = playableCards.first();
  await expect(firstPlayable).toBeFocused();
  const playableCount = await playableCards.count();
  const initialCard = await firstPlayable.getAttribute('aria-label');
  await page.keyboard.press('ArrowRight');
  if (playableCount > 1) {
    await expect(firstPlayable).not.toBeFocused();
  } else {
    await expect(firstPlayable).toBeFocused();
  }
  await page.keyboard.press('Enter');

  await expect(hand.locator('[data-hand-card]')).toHaveCount(12);
  expect(initialCard).toMatch(/^Play /);
});

test('the table menu and nested rules sheet trap and restore keyboard focus', async ({
  page,
  browserName,
}) => {
  await page.goto('/klondike/table/');
  const menuTrigger = page.getByRole('button', { name: /table menu/i });
  await tabTo(page, menuTrigger, browserName);
  await page.keyboard.press('Enter');

  const menu = page.getByTestId('table-menu').getByRole('dialog');
  const resume = menu.getByRole('button', { name: /back to the table/i });
  await expect(menu).toBeVisible();
  await expect(resume).toBeFocused();

  const focusableCount = await menu
    .locator(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )
    .evaluateAll(
      (elements) =>
        elements.filter(
          (element) =>
            element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0,
        ).length,
    );
  expect(focusableCount).toBeGreaterThan(1);
  for (let press = 0; press < focusableCount + 2; press += 1) {
    await pressTab(page, browserName);
    expect(await menu.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  }
  for (let press = 0; press < focusableCount + 2; press += 1) {
    await pressTab(page, browserName, true);
    expect(await menu.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  }

  const rulesTrigger = menu.getByTestId('how-to-play-klondike');
  await tabTo(page, rulesTrigger, browserName);
  await page.keyboard.press('Enter');
  const rules = page.getByTestId('how-to-play');
  const closeRules = page.getByTestId('close-how-to-play');
  await expect(rules).toBeVisible();
  await expect(closeRules).toBeFocused();
  await pressTab(page, browserName);
  await expect(closeRules).toBeFocused();
  await pressTab(page, browserName, true);
  await expect(closeRules).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(rules).toHaveCount(0);
  await expect(rulesTrigger).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('table-menu')).toHaveCount(0);
  await expect(menuTrigger).toBeFocused();
});
