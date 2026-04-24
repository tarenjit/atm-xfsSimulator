import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E smoke config.
 *
 * Connects to an already-running pnpm serve (frontend :3000, backend
 * :3001). Does NOT spawn its own web server — the tests assume you
 * have the full stack up. In CI we'd set webServer to run
 * `pnpm --filter @atm/atm-frontend start` + `pnpm --filter @atm/xfs-server start:prod`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1, // single ATM session — can't run parallel
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
