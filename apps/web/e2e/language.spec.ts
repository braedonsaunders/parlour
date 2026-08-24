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
  await page.getByTestId('language-button').click();
  await page.getByTestId('language-option-en').click();
  await expect(page.getByTestId('play')).toHaveText('Play');

  await page.reload();
  // Still English: a device set to Spanish must not overrule someone who said
  // otherwise — that is the case for anyone on a borrowed or shared machine.
  await expect(page.getByTestId('play')).toHaveText('Play');
  await context.close();
});
