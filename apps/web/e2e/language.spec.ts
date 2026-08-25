import { expect, test } from '@playwright/test';

/**
 * Language switching, in a real browser.
 *
 * The unit tests prove the catalogues are complete and that a component reads
 * the right one. Only a browser can prove the parts that matter to a player:
 * that the choice survives a reload, that it reaches `<html lang>` (which is
 * what a screen reader picks its voice from), and that a device set to Spanish
 * gets Spanish without being asked.
 */

test('the home screen offers a language switch beside the mute button', async ({ page }) => {
  await page.goto('/');
  const language = page.getByTestId('language-button');
  const mute = page.getByRole('button', { name: /sound/i });
  await expect(language).toBeVisible();
  await expect(mute).toBeVisible();

  // "Next to", not "somewhere on the page": they share a chrome cluster, and a
  // layout change that separates them is a regression worth catching.
  const a = await language.boundingBox();
  const b = await mute.boundingBox();
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(a!.height);
});

test('choosing Spanish translates the screen and sets the document language', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('play')).toHaveText('Play');

  await page.getByTestId('language-button').click();
  await page.getByTestId('language-option-es').click();

  await expect(page.getByTestId('play')).toHaveText('Jugar');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('the choice survives a reload and reaches other screens', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('language-button').click();
  await page.getByTestId('language-option-es').click();
  await expect(page.getByTestId('play')).toHaveText('Jugar');

  await page.reload();
  await expect(page.getByTestId('play')).toHaveText('Jugar');

  await page.goto('/join/');
  await expect(page.getByRole('heading', { name: 'Únete a una mesa' })).toBeVisible();
});

test('the options menu carries the same switch', async ({ page }) => {
  await page.goto('/profile/');
  await page.getByTestId('language-choice-es').click();
  await expect(page.getByRole('heading', { name: 'Perfil' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');

  await page.getByTestId('language-choice-en').click();
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
});

test('a Spanish device gets Spanish without being asked', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'es-MX' });
  const page = await context.newPage();
  await page.goto('/');
  // Regional Spanish matches on the primary subtag, so es-MX lands on es.
  await expect(page.getByTestId('play')).toHaveText('Jugar');
  await context.close();
});

test('an explicit choice outranks the device language', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'es-MX' });
  const page = await context.newPage();
  await page.goto('/');
  // iPhone-sized WebKit puts the update toast over the chrome cluster. The
  // banner itself is not clickable, but dismiss it so the language switch is
  // the thing under the finger.
  const dismiss = page.getByRole('button', { name: 'Dismiss update' });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.getByTestId('language-button').click();
  await page.getByTestId('language-option-en').click();
  await expect(page.getByTestId('play')).toHaveText('Play');

  await page.reload();
  // Still English: a device set to Spanish must not overrule someone who said
  // otherwise — that is the case for anyone on a borrowed or shared machine.
  await expect(page.getByTestId('play')).toHaveText('Play');
  await context.close();
});

test('the shelf and its rules sheet speak the chosen language', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('language-button').click();
  await page.getByTestId('language-option-es').click();

  await page.goto('/games/');
  // Game copy lives in the packs and is translated by an overlay; this is the
  // proof that the overlay actually reaches the screen rather than only the
  // unit tests.
  await expect(page.getByText('La estantería de juegos')).toBeVisible();
  await expect(page.getByTestId('game-hearts')).toContainText('Corazones');
  await expect(page.getByPlaceholder('Buscar juegos…')).toBeVisible();
});

test('offers every language it ships, in that language', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('language-button').click();
  // Each option is labelled in its own language — someone looking for their
  // own is looking for the word they would write, not the English for it.
  for (const [id, native] of [
    ['en', 'English'],
    ['es', 'Español'],
    ['fr', 'Français'],
    ['pt', 'Português'],
    ['zh', '简体中文'],
  ] as const) {
    await expect(page.getByTestId(`language-option-${id}`)).toContainText(native);
  }
});

test.describe('Simplified Chinese', () => {
  test('translates the chrome and the games, and sets a Han lang tag', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('language-button').click();
    await page.getByTestId('language-option-zh').click();

    await expect(page.getByTestId('play')).toHaveText('开玩');
    // zh-Hans, not bare zh: the tag is what a screen reader and the browser's
    // line-breaker read, and Han script needs the script subtag.
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');

    await page.goto('/games/');
    await expect(page.getByTestId('game-hearts')).toContainText('红心大战');
  });

  /**
   * Chinese is denser than English and the shelf tile is a fixed box, so the
   * fact chips are the first thing that would overflow. This is the check that
   * the copy was written to the layout rather than only to the dictionary.
   */
  test('keeps the shelf tiles from overflowing', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('language-button').click();
    await page.getByTestId('language-option-zh').click();
    await page.goto('/games/');

    const tile = page.getByTestId('game-hearts');
    await expect(tile).toBeVisible();
    const overflow = await tile.evaluate((el) => ({
      x: el.scrollWidth - el.clientWidth,
      y: el.scrollHeight - el.clientHeight,
    }));
    expect(overflow.x, 'shelf tile overflows horizontally in Chinese').toBeLessThanOrEqual(1);
    expect(overflow.y, 'shelf tile overflows vertically in Chinese').toBeLessThanOrEqual(1);
  });
});

test('French and Portuguese reach both the chrome and the games', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('language-button').click();
  await page.getByTestId('language-option-fr').click();
  await expect(page.getByTestId('play')).toHaveText('Jouer');
  await page.goto('/games/');
  await expect(page.getByTestId('game-hearts')).toContainText('Cœurs');

  await page.goto('/');
  await page.getByTestId('language-button').click();
  await page.getByTestId('language-option-pt').click();
  await expect(page.getByTestId('play')).toHaveText('Jogar');
  await page.goto('/games/');
  await expect(page.getByTestId('game-hearts')).toContainText('Copas');
});
