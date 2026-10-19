import { test as base, expect } from '@playwright/test';
import pg from 'pg';
import { settings } from './settings.js';
import { ServiceRequestsApi } from './api/service-requests-api.js';
import { ServiceDeskDb } from './db/service-desk-db.js';
import { ServiceRequestsPage } from './pages/service-requests.page.js';

type TestFixtures = {
  /** API client on Playwright's per-test request context (baseURL from config). */
  api: ServiceRequestsApi;
  /** Read-only database checks. */
  db: ServiceDeskDb;
  /** Page object, already opened. */
  requestsPage: ServiceRequestsPage;
};

type WorkerFixtures = {
  /** One connection pool per worker process, closed when the worker ends. */
  dbPool: pg.Pool;
};

/**
 * Fixtures replace NUnit's [SetUp]/[OneTimeSetUp]: each test declares what it needs
 * ({ api, db, requestsPage }) and Playwright builds and tears it down, per test or per worker.
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  dbPool: [
    async ({}, use) => {
      const pool = new pg.Pool({ connectionString: settings.databaseUrl, max: 4 });
      await use(pool);
      await pool.end();
    },
    { scope: 'worker' },
  ],

  db: async ({ dbPool }, use) => {
    await use(new ServiceDeskDb(dbPool));
  },

  api: async ({ request }, use) => {
    await use(new ServiceRequestsApi(request));
  },

  requestsPage: async ({ page }, use) => {
    const requestsPage = new ServiceRequestsPage(page);
    await requestsPage.open();
    await use(requestsPage);
  },
});

export { expect };
