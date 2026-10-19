import { defineConfig, devices } from '@playwright/test';
import { settings } from './src/settings.js';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  // One retry in CI only: Playwright then reports the test as "flaky" instead of hiding it.
  retries: isCI ? 1 : 0,
  workers: isCI ? 4 : undefined,
  reporter: isCI
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: settings.baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      // API + database tests: no browser needed, so they're fast.
      name: 'api',
      testMatch: /tests\/(api|db)\/.*\.spec\.ts/,
    },
    {
      name: 'ui',
      testMatch: /tests\/(ui|e2e)\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Starts the app under test before the run (or reuses one already running locally).
  webServer: {
    command: 'npm run start:app',
    url: `${settings.baseURL}/health`,
    reuseExistingServer: !isCI,
    timeout: 30_000,
    env: { DATABASE_URL: settings.databaseUrl },
  },
});
