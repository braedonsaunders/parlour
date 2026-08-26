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

test('leaving a table returns to its shelf without orphaning keyboard focus', async ({
  page,
  browserName,
}) => {
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

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.activeElement !== document.body &&
          document.activeElement !== document.documentElement,
      ),
    )
    .toBe(true);
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect
    .poll(() =>
      page.evaluate(() => ['A', 'BUTTON'].includes(document.activeElement?.tagName ?? '')),
    )
    .toBe(true);
});

/*
 * The hand is one held fan in both orientations. It compresses to fit whatever
 * it holds; it never pans, and it never has its cards cut off. A previous batch
 * replaced portrait with a scrolling row that hid nine of thirteen cards and
 * sliced the top off every playable one, so these assertions are deliberately
 * about what a player can SEE rather than about what exists in the DOM.
 */
const HAND_GAMES = [
  { game: 'spades', cards: 13 },
  { game: 'hearts', cards: 13 },
  { game: 'president', cards: 13 },
  { game: 'gin', cards: 10 },
] as const;

for (const orientation of ['portrait', 'landscape'] as const) {
  const viewport =
    orientation === 'portrait' ? { width: 390, height: 844 } : { width: 844, height: 390 };

  test.describe(`${orientation} hand rails`, () => {
    test.use({ viewport });

    for (const { game, cards } of HAND_GAMES) {
      test(`${game} holds every card in one visible fan`, async ({ page }) => {
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

        const layout = await hand.evaluate((rail) => {
          const track = rail.querySelector<HTMLElement>('[data-hand-track]');
          if (!track) throw new Error('hand rail has no track');
          const cardEls = [...rail.querySelectorAll<HTMLElement>('[data-hand-card]')];
          const boxes = cardEls.map((card) => card.getBoundingClientRect());
          const fans = cardEls.map(
            (card) =>
              getComputedStyle(card.querySelector<HTMLElement>('[data-hand-fan]')!).transform,
          );

          const trackStyle = getComputedStyle(track);
          return {
            // The invariant is that no ancestor of the cards is a scroll
            // container or a clipping box. Comparing scrollWidth to clientWidth
            // would not say this: the fan's rotated corners overflow a visible
            // box by a few pixels by design, which is harmless.
            overflow: [trackStyle.overflowX, trackStyle.overflowY],
            withinWidth: boxes.every((box) => box.left >= -1 && box.right <= window.innerWidth + 1),
            // The top of a card carries its rank. Clipping it is what made the
            // scrolling row unreadable, so it is asserted exactly.
            topClipped: Math.max(0, ...boxes.map((box) => -box.top)),
            // A held hand may sit a few pixels into the bottom edge — short
            // landscape docks it there deliberately to leave the felt room.
            bottomBleed: Math.max(0, ...boxes.map((box) => box.bottom - window.innerHeight)),
            // A fan overlaps: consecutive cards advance by less than a card.
            overlaps: boxes
              .slice(1)
              .every((box, index) => box.left - boxes[index]!.left < boxes[index]!.width),
            // ...and it arcs: the outermost cards carry a rotation.
            outerRotated: fans[0] !== fans[Math.floor(fans.length / 2)],
            count: boxes.length,
          };
        });

        expect(layout.count).toBe(cards);
        expect(layout.overflow, 'the hand never pans and never clips').toEqual([
          'visible',
          'visible',
        ]);
        expect(layout.withinWidth, 'the fan fits the width, gutters and all').toBe(true);
        expect(layout.topClipped, 'no card has its rank cut off').toBe(0);
        expect(layout.bottomBleed, 'the hand is docked, not falling off').toBeLessThanOrEqual(16);
        expect(layout.overlaps, 'cards overlap the way a held hand does').toBe(true);
        expect(layout.outerRotated, 'the hand is fanned, not laid out straight').toBe(true);
      });
    }
  });
}
