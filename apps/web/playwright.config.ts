import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config (E11). Drives the built SPA against a running API stack. The web
 * dev server is started by Playwright; the API must be running separately (see
 * docs/backend + SESSION-LOG) and is reached through the Vite proxy. The
 * pre-installed Chromium is used via executablePath so no download is needed.
 *
 * Run: VITE_API_PROXY_TARGET=http://localhost:3111 pnpm test:e2e
 * These tests are intentionally excluded from `pnpm test` (vitest) — they need
 * Postgres + Redis + API and so run on demand / in a dedicated CI stage.
 */
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3111';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: CHROMIUM },
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
    env: { VITE_API_PROXY_TARGET: API_TARGET },
  },
});
