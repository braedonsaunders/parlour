/* Rat Screw browser loop: /games shelf → /ratscrew → solo match → slaps → zero console errors. */
const BASE = process.env.BASE_URL || 'http://localhost:3311';

async function waitFor(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await fn();
      if (last) return last;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timeout waiting for ${label}: ${JSON.stringify(last)}`);
}

async function gameState(page) {
  return page.evaluate(() => {
    const text = window.render_game_to_text?.();
    return text ? JSON.parse(text) : null;
  });
}

(async () => {
  const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  // 1. shelf shows the ratscrew tile and routes to setup
  await page.goto(`${BASE}/games`, { waitUntil: 'networkidle' });
  await waitFor(
    () =>
      page
        .locator('[data-testid="game-ratscrew"]')
        .count()
        .then((n) => n > 0),
    20_000,
    'ratscrew tile on /games',
  );
  await page.click('[data-testid="game-ratscrew"]');
  await waitFor(
    () =>
      page
        .getByTestId('deal-me-in')
        .count()
        .then((n) => n > 0),
    15_000,
    'setup CTA',
  );

  // 2. pick quick-reflex, 3 seats, deal in
  await page.getByRole('radio', { name: /Quick Reflex/ }).click();
  await page.getByRole('button', { name: '3', exact: true }).first().click();
  await page.getByTestId('deal-me-in').click();

  // 3. play: flip whenever it is our turn; slap the first live window
  await waitFor(async () => (await gameState(page))?.status === 'ready', 30_000, 'table ready');
  let slapped = false;
  for (let step = 0; step < 200; step++) {
    const state = await gameState(page);
    if (!state || state.status !== 'ready') break;
    if (!slapped && state.window) {
      slapped = true;
      await page.getByRole('button', { name: 'SLAP!' }).click();
    } else if (state.canFlip && state.turnSeat === state.localSeat) {
      await page.getByRole('button', { name: 'Flip' }).click();
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  const finalState = await gameState(page);
  if (!slapped) throw new Error('never got to slap a live window');
  if (!finalState || finalState.centerCount === undefined) throw new Error('table lost its state');
  if (finalState.status === 'ended') {
    // full match ran to a winner: the page should land on the shared podium
    await waitFor(() => page.url().includes('/match-end'), 10_000, 'match-end podium');
    console.log('match completed end-to-end — podium reached');
  } else if (finalState.status !== 'ready') {
    throw new Error(`unexpected status ${finalState.status}`);
  }
  console.log(
    `loop ok — center=${finalState.centerCount} myStack=${finalState.myStack} status=${finalState.status}`,
  );

  // 4. screenshot for the acceptance doc (table, or podium when the match ran dry)
  await page.screenshot({
    path: `docs/shots/ratscrew-${finalState.status === 'ended' ? 'match-end' : 'table'}.png`,
  });
  if (finalState.status !== 'ended') {
    await page.screenshot({ path: 'docs/shots/ratscrew-table.png' });
  }

  // 5. direct table load (deep link resilience)
  await page.goto(`${BASE}/ratscrew/table`, { waitUntil: 'networkidle' });
  await waitFor(async () => (await gameState(page))?.status === 'ready', 30_000, 're-dealt table');

  if (consoleErrors.length > 0) {
    console.error('CONSOLE ERRORS:', consoleErrors);
    process.exit(1);
  }
  console.log('zero console errors across /games, /ratscrew and /ratscrew/table');
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
