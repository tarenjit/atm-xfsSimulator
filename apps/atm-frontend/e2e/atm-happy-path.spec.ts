import { test, expect } from '@playwright/test';

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3001';

/**
 * Clean slate between tests — the ATM is a single-session model, so any
 * pending session from a previous run would block `insertCard`.
 */
test.beforeEach(async ({ request }) => {
  await request.post(`${BACKEND}/api/v1/sessions/cancel`, {
    data: {},
  });
});

test.describe('/atm happy path', () => {
  test('page renders, connects, insert card via UI → PIN_ENTRY state', async ({ page }) => {
    await page.goto('/atm');

    // Header rendered — proves Tailwind + theme CSS compiled.
    await expect(page.getByText('ATMirror', { exact: true })).toBeVisible();
    await expect(page.getByText('SELAMAT DATANG')).toBeVisible();

    // Connection status should go from "disconnected" → "connected"
    // within a few seconds once the WS client catches up.
    await expect(page.getByText('connected', { exact: true })).toBeVisible({ timeout: 10_000 });

    // Pick the happy-path card.
    const select = page.locator('aside select').first();
    await expect(select).toBeVisible();
    await select.selectOption('4580123456787234');

    await page.getByRole('button', { name: 'Insert card' }).click();

    // The bank screen should show the PIN prompt.
    await expect(page.getByText('MASUKKAN PIN ANDA')).toBeVisible({ timeout: 10_000 });
    // Header state indicator shows PIN_ENTRY too.
    await expect(page.locator('header').getByText('PIN_ENTRY')).toBeVisible();
  });

  test('full withdrawal driven via REST, UI reflects each state', async ({ page, request }) => {
    // The PIN key-press timing through the UI is fragile in headless
    // runs (xfs device simulateDelay + React effect re-arm), so we drive
    // the state machine via REST and assert the UI reflects each state.
    // This is still end-to-end because the UI is the subscriber — it
    // only updates when the backend actually broadcasts via WS.
    await page.goto('/atm');
    await expect(page.getByText('connected', { exact: true })).toBeVisible({ timeout: 10_000 });

    // Insert.
    const insert = await request.post(`${BACKEND}/api/v1/sessions/insert-card`, {
      data: { pan: '4580123456787234' },
    });
    expect(insert.ok()).toBe(true);
    await expect(page.getByText('MASUKKAN PIN ANDA')).toBeVisible({ timeout: 10_000 });

    // PIN entry + 111111 + ENTER (all REST — single round trip via
    // /sessions/begin-pin while keys are pressed concurrently).
    const pinPromise = request.post(`${BACKEND}/api/v1/sessions/begin-pin`, {
      data: {},
      timeout: 15_000,
    });
    // Short delay so the PIN device arms before keys arrive.
    await page.waitForTimeout(400);
    for (const k of ['1', '1', '1', '1', '1', '1']) {
      await request.post(`${BACKEND}/api/v1/sessions/press-key`, { data: { key: k } });
    }
    await request.post(`${BACKEND}/api/v1/sessions/press-key`, { data: { key: 'ENTER' } });
    const pinRes = await pinPromise;
    expect(pinRes.ok()).toBe(true);
    const pinBody = await pinRes.json();
    expect(pinBody.verified).toBe(true);

    // MAIN_MENU.
    await expect(page.getByText('MENU UTAMA')).toBeVisible({ timeout: 10_000 });

    // Select WITHDRAWAL + submit 300k + confirm via REST.
    await request.post(`${BACKEND}/api/v1/sessions/select-transaction`, {
      data: { txnType: 'WITHDRAWAL' },
    });
    await request.post(`${BACKEND}/api/v1/sessions/submit-amount`, {
      data: { amount: 300_000 },
    });
    // CONFIRM screen.
    await expect(page.getByText('ANDA AKAN MENARIK')).toBeVisible({ timeout: 10_000 });
    // Amount appears in 3 places (bank screen, session panel, confirm button)
    // — any one visible proves the state.
    await expect(page.getByText(/Rp\s*300\.?000/).first()).toBeVisible();

    await request.post(`${BACKEND}/api/v1/sessions/confirm`, { data: {} });

    // Session returns to IDLE after dispense+print+eject completes.
    await expect(page.getByText('SELAMAT DATANG')).toBeVisible({ timeout: 15_000 });

    // Transaction persisted.
    const res = await request.get(`${BACKEND}/api/v1/logs/transactions?limit=1`);
    const body = await res.json();
    expect(body.transactions[0].txnType).toBe('WITHDRAWAL');
    expect(body.transactions[0].status).toBe('COMPLETED');
  });

  test('cancel button during PIN_ENTRY ejects the card', async ({ page }) => {
    await page.goto('/atm');
    await page.locator('aside select').first().selectOption('4580123456787234');
    await page.getByRole('button', { name: 'Insert card' }).click();
    await expect(page.getByText('MASUKKAN PIN ANDA')).toBeVisible();

    // Hit Cancel session in the action panel.
    await page.getByRole('button', { name: 'Cancel session', exact: true }).click();

    // Should return to the IDLE welcome.
    await expect(page.getByText('SELAMAT DATANG')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('/operator smoke', () => {
  test('all panels render', async ({ page }) => {
    await page.goto('/operator');
    // Header
    await expect(page.getByRole('heading', { name: 'Zegen ATM Simulator' })).toBeVisible();
    // Section headings — each panel has a dedicated <h2>. Use role=heading
    // so we don't collide with footer prose or running-text occurrences.
    for (const heading of [
      'Bank theme',
      'Macro Test Studio',
      'Macro Suites',
      'Devices',
      'Cassettes',
      'XFS event stream',
      'Recent transactions',
      'Session history',
      'Virtual cards',
    ]) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
  });

  test('theme switcher flips the active theme', async ({ page, request }) => {
    await page.goto('/operator');
    // Click BSI tile (use role=button with text "Bank Syariah Indonesia").
    await page.getByRole('button', { name: /Bank Syariah Indonesia/i }).click();
    await expect(page.getByText('active: bsi')).toBeVisible({ timeout: 10_000 });

    // Confirm over REST.
    const r = await request.get(`${BACKEND}/api/v1/themes/active`);
    const body = await r.json();
    expect(body.theme.code).toBe('bsi');

    // Flip back to Mandiri.
    await page.getByRole('button', { name: /Bank Mandiri/i }).click();
    await expect(page.getByText('active: mandiri')).toBeVisible({ timeout: 10_000 });
  });
});
