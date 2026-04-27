import { test, expect } from '@playwright/test';

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3001';

/**
 * E2E coverage for the Phase 7.3 Reports panel.
 *
 * 1. Trigger a macro run via REST so the panel has at least one row.
 * 2. Navigate to /operator and assert the Reports section renders + the
 *    summary tiles + the run table populates.
 * 3. Filter by status PASSED — table re-renders.
 * 4. Click a row → drill-down drawer opens with step results + macro
 *    description + PDF download links.
 *
 * The PDF endpoints themselves are unit-tested separately in
 * apps/xfs-server/src/reports/reports.service.spec.ts; here we just
 * confirm the UI offers the link with the right href.
 */

test.beforeEach(async ({ request }) => {
  await request.post(`${BACKEND}/api/v1/sessions/cancel`, { data: {} });
  // Trigger one fresh macro run so the panel has data — pick the
  // happy-path withdrawal which is the first seeded macro.
  const macros = await request.get(`${BACKEND}/api/v1/macros`);
  const list = await macros.json();
  const happy = list.macros.find((m: { name: string }) =>
    m.name.toLowerCase().includes('happy-path withdrawal'),
  );
  if (happy) {
    await request.post(`${BACKEND}/api/v1/macros/${happy.id}/run`, { data: {} });
  }
});

test.describe('/operator Reports panel', () => {
  test('renders summary, run table, and detail drawer with PDF links', async ({ page }) => {
    await page.goto('/operator');

    // Section heading present.
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();

    // Summary tiles render. "Passed"/"Failed" also appear inside the
    // filter <select> as <option> values, so locate via the .div labels
    // — they live inside the summary grid above the run table.
    await expect(page.getByText('Total runs', { exact: true })).toBeVisible();

    // Executive PDF button present + has the right URL pattern.
    const execLink = page.getByTestId('reports-executive-pdf');
    await expect(execLink).toBeVisible();
    const execHref = await execLink.getAttribute('href');
    expect(execHref).toMatch(/\/api\/v1\/reports\/executive\?month=\d{4}-\d{2}/);

    // Run table populated — at least one row from beforeEach's run.
    const table = page.getByTestId('reports-run-table');
    await expect(table).toBeVisible();
    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    // Filter to PASSED.
    await page.getByTestId('reports-status-filter').selectOption('PASSED');
    // Allow the refresh to land.
    await page.waitForTimeout(300);

    // Click first row → drill-down drawer opens.
    await rows.first().click();
    const drawer = page.getByTestId('reports-detail-drawer');
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    await expect(drawer.getByText('What this scenario exercises')).toBeVisible();
    await expect(drawer.getByText(/Step results/)).toBeVisible();

    // Per-run PDF link present + correct URL pattern.
    const runPdf = drawer.getByTestId('reports-run-pdf');
    await expect(runPdf).toBeVisible();
    const runHref = await runPdf.getAttribute('href');
    expect(runHref).toMatch(/\/api\/v1\/reports\/macro-run\/[a-z0-9]+\/pdf/);

    // Close drawer.
    await drawer.getByRole('button', { name: 'Close detail drawer' }).click();
    await expect(drawer).not.toBeVisible();
  });
});
