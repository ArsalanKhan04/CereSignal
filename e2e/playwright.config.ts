import { defineConfig, devices } from '@playwright/test';

/**
 * Browser E2E suite. Runs against a real backend, worker and production frontend
 * build, all on localhost, with AI, Supabase and email off (see stack.sh), so it
 * needs no secrets and reaches no paid service.
 *
 * Serial on purpose: the specs share one seeded database, and a single Chromium
 * worker keeps the CI job on one standard runner.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: './stack.sh',
      url: 'http://127.0.0.1:8000/health',
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      // Serves frontend/build, which must already exist: `npm --prefix frontend run
      // build` (./scripts/test.sh --e2e builds it when missing).
      command: 'npm --prefix ../frontend start',
      url: 'http://localhost:3000',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
