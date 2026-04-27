import { test, expect } from '@playwright/test';

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3001';
const HAPPY_PAN = '4580123456787234';

/**
 * E2E coverage for the Phase 7.2 sub-menu work.
 *
 * Single test rather than four — the ATM is a single-session model and
 * cycling sessions between tests racing against in-flight begin-pin POSTs
 * is fragile. One test, one session, all four flows exercised in sequence.
 *
 * Flows covered:
 *   - UANG ELEKTRONIK FDK (FDK_C) → modal overlay; click to dismiss
 *   - MENU LAINNYA FDK (FDK_H) → sub-menu screen replaces main menu
 *   - SUB_MENU TRANSFER → coming-soon overlay; dismiss
 *   - SUB_MENU SETOR TUNAI → coming-soon overlay; dismiss
 *   - SUB_MENU PEMBAYARAN → coming-soon overlay; dismiss
 *   - SUB_MENU KEMBALI → returns to main-menu screen
 */

test.beforeEach(async ({ request }) => {
  await request.post(`${BACKEND}/api/v1/sessions/cancel`, { data: {} });
});

test.describe('/atm MENU LAINNYA sub-menu + UANG ELEKTRONIK overlay', () => {
  test('all FDK click flows behave correctly in one session', async ({ page, request }) => {
    await page.goto('/atm');
    await expect(page.getByText('connected', { exact: true })).toBeVisible({ timeout: 10_000 });

    // -- Drive session up to MAIN_MENU using the same dance as happy-path #2 --
    const insert = await request.post(`${BACKEND}/api/v1/sessions/insert-card`, {
      data: { pan: HAPPY_PAN },
    });
    expect(insert.ok()).toBe(true);
    await expect(page.getByText('MASUKKAN PIN ANDA')).toBeVisible({ timeout: 10_000 });

    const pinPromise = request.post(`${BACKEND}/api/v1/sessions/begin-pin`, {
      data: {},
      timeout: 15_000,
    });
    await page.waitForTimeout(400);
    for (const k of ['1', '1', '1', '1', '1', '1', 'ENTER']) {
      await request.post(`${BACKEND}/api/v1/sessions/press-key`, { data: { key: k } });
    }
    await pinPromise;

    await expect(page.getByText('MENU UTAMA')).toBeVisible({ timeout: 10_000 });

    // -- 1. UANG ELEKTRONIK from main menu → overlay --
    await page.locator('button[title="UANG ELEKTRONIK"]').click();
    let overlay = page.getByTestId('bank-screen-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('UANG ELEKTRONIK');
    await expect(overlay).toContainText('belum tersedia');
    await overlay.click();
    await expect(overlay).not.toBeVisible();
    await expect(page.getByText('MENU UTAMA')).toBeVisible();

    // -- 2. MENU LAINNYA → swap to sub-menu screen --
    await page.locator('button[title="MENU LAINNYA"]').click();
    await expect(page.getByText('CEK SALDO')).toBeVisible();
    await expect(page.getByText('TRANSFER')).toBeVisible();
    await expect(page.getByText('SETOR TUNAI')).toBeVisible();
    await expect(page.getByText('PEMBAYARAN')).toBeVisible();
    // 'KEMBALI' also appears in the instruction text "PILIH LAYANAN ATAU TEKAN KEMBALI"
    // — assert via the FDK button title attribute instead.
    await expect(page.locator('button[title="KEMBALI"]')).toBeEnabled();

    // -- 3. SUB_MENU TRANSFER → overlay --
    await page.locator('button[title="TRANSFER"]').click();
    overlay = page.getByTestId('bank-screen-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('TRANSFER');
    await expect(overlay).toContainText('pengembangan');
    await overlay.click();
    await expect(overlay).not.toBeVisible();

    // -- 4. SUB_MENU SETOR TUNAI → overlay --
    await page.locator('button[title="SETOR TUNAI"]').click();
    overlay = page.getByTestId('bank-screen-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('SETOR TUNAI');
    await expect(overlay).toContainText('pengembangan');
    await overlay.click();
    await expect(overlay).not.toBeVisible();

    // -- 5. SUB_MENU PEMBAYARAN → overlay --
    await page.locator('button[title="PEMBAYARAN"]').click();
    overlay = page.getByTestId('bank-screen-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('PEMBAYARAN');
    await expect(overlay).toContainText('pengembangan');
    await overlay.click();
    await expect(overlay).not.toBeVisible();

    // -- 6. KEMBALI → back to MAIN_MENU view --
    await page.locator('button[title="KEMBALI"]').click();
    await expect(page.getByText('300.000')).toBeVisible();
    await expect(page.getByText('1.000.000')).toBeVisible();
    // CEK SALDO no longer in DOM (sub-menu gone).
    await expect(page.getByText('CEK SALDO')).not.toBeVisible();
  });
});
