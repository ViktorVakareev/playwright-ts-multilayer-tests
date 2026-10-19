# playwright-ts-multilayer-tests

Multi-layer test automation with **Playwright Test and TypeScript**: API tests, PostgreSQL data validation, UI tests and end-to-end tests for a small "service request → approval → fulfilment → invoice" app that ships with the repo. GitHub Actions runs it against a Postgres service container.

The same app and test plan also exist in C#/.NET (NUnit, RestSharp, Reqnroll) in [dotnet-multilayer-test-automation](https://github.com/ViktorVakareev/dotnet-multilayer-test-automation), so the two frameworks can be compared side by side.

> **Status:** 36 tests, all passing; 180/180 over five repeated runs (`--repeat-each=5`) with no flaky results. All data is invented.

## What's covered where

| Area | Where it lives |
|---|---|
| API tests (status codes, contract, negative cases) | `tests/api/` with the client in `src/api/service-requests-api.ts` (Playwright `APIRequestContext`) |
| Database validation | `tests/db/` with `src/db/service-desk-db.ts` (`pg`, parameterised SQL) |
| UI tests | `tests/ui/` with the page object `src/pages/service-requests.page.ts` |
| End-to-end business process | `tests/e2e/request-to-invoice.spec.ts` (UI → API → UI → API + DB, as `test.step`s) |
| Fixtures (setup/teardown) | `src/fixtures.ts`: `api`, `db`, `requestsPage` per test; a DB pool per worker |
| Test data | `src/data/service-request-builder.ts` (unique data per test); `tests/global-setup.ts` reseeds the DB per run |
| CI | `.github/workflows/tests.yml`: Postgres service, typecheck, smoke on PRs, full run on main and nightly, report and traces as artifacts |

## The app under test (business rules)

| Rule | Behaviour |
|---|---|
| R1 | Amount 0.01–10,000.00, at most 2 decimals, else 400 |
| R2 | Title 3–100 characters after trimming, else 400 |
| R3 | Customer must exist and be active, else 400 |
| R4 | ≤ 5,000.00 → `Approved` automatically; > 5,000.00 → `PendingApproval` |
| R5 | `PendingApproval → Approved / Rejected`, `Approved → Fulfilled`; anything else 409 |
| R6 | Fulfilment creates exactly one invoice, VAT 20%, rounded half away from zero |
| R7 | Every status change writes one `audit_log` row in the same transaction |

`app/server.ts` is a small Express + PostgreSQL service with a static UI (`app/public/index.html`).

## Run it locally (Windows, PowerShell)

Needs Node.js 20+ and PostgreSQL (Docker, or a local install).

```powershell
npm ci
npx playwright install chromium

# Database: Docker...
docker compose up -d
# ...or a local PostgreSQL with a qa/qa user and a servicedesk database (the tests reseed it each run)

npm test                     # everything: Playwright starts the app for you (webServer)
npm run test:api             # API + DB tests only, no browser
npm run test:smoke           # @smoke tag only
npm run test:headed          # watch the UI tests in a visible browser
npm run report               # open the HTML report (traces for failed tests are inside)
npm run typecheck            # tsc --noEmit
```

Settings come from environment variables `BASE_URL` and `DATABASE_URL` (see `.env.example`); the defaults match `docker-compose.yml`.

## How it's built

**Fixtures instead of setup methods.** Each test asks for what it needs and Playwright builds and disposes it:

```ts
test('TC-19 fulfilling twice returns 409 and creates one invoice', async ({ api, db }) => {
  const approved = await api.createApproved(aServiceRequest().withAmount(300).build());

  const first = await api.fulfil(approved.id);
  const second = await api.fulfil(approved.id);

  expect(first.status).toBe(200);
  expect(second.status).toBe(409);
  expect(await db.invoices(approved.id)).toHaveLength(1);
});
```

`api` wraps the per-test `request` context, `db` uses a connection pool created once per **worker** (`{ scope: 'worker' }`), and `requestsPage` opens the page before the test starts.

**Two projects, one config.** `api` runs `tests/api` and `tests/db` without a browser; `ui` runs `tests/ui` and `tests/e2e` in Chromium. Both run fully in parallel.

**Exact money checks.** `pg` returns `NUMERIC` as strings, so database assertions compare `'1500.00'` exactly instead of floats. The app does VAT arithmetic in SQL for the same reason.

## Design choices

- **Test pyramid:** business rules are tested at the API and DB level (fast, stable); the UI suite only checks what the API can't see; one E2E test covers the critical path across all layers.
- **Assert the database, not just the response:** a 200 with the right JSON doesn't prove the invoice row, the VAT or the audit trail were written.
- **Refused changes must change nothing:** invalid-transition tests also check that status and audit trail are untouched.
- **Concurrency:** five parallel `fulfil` calls must produce exactly one invoice (`SELECT … FOR UPDATE` in the app).
- **Independent, parallel-safe data:** every test creates its own request through the API; global setup reseeds the database once per run.
- **Waiting for the right thing:** after a second submit, the "created id" label still shows the previous id for a moment, so the page object waits for the value to *change*, not just for any number.
- **Failure evidence:** traces, screenshots and video are kept only for failed tests; in CI the HTML report and `test-results/` are uploaded as artifacts, and one retry marks a test as *flaky* instead of hiding it.

## Project structure

```
playwright-ts-multilayer-tests/
├── app/                      app under test: Express + pg (server.ts), static UI (public/)
├── db/init.sql               schema, constraints, seed data
├── src/
│   ├── api/                  typed API client + DTOs
│   ├── db/                   read-only DB checks
│   ├── data/                 test-data builder
│   ├── pages/                page object
│   ├── fixtures.ts           test.extend: api, db, requestsPage, worker-scoped dbPool
│   └── settings.ts           env-based settings
├── tests/
│   ├── api/  db/  ui/  e2e/  specs (TC ids match the test plan)
│   └── global-setup.ts       reseed the database before each run
├── scripts/reset-db.ts       npm run db:reset
├── playwright.config.ts      projects, reporters, traces, webServer
├── .github/workflows/tests.yml
└── docker-compose.yml        local PostgreSQL
```
