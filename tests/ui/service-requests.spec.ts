import { test, expect } from '../../src/fixtures.js';
import { settings } from '../../src/settings.js';

/**
 * UI layer: only what the API tests can't see (rendering, which buttons appear, error display).
 * Business rules are covered once at the API level, not repeated here.
 */
test.describe('Service request UI', () => {
  test('TC-30 small request shows as Approved with only a Fulfil button', { tag: '@smoke' }, async ({ requestsPage }) => {
    const id = await requestsPage.create(settings.activeCustomerId, 'UI laptop bag', 49.9);

    await requestsPage.expectStatus(id, 'Approved');
    await expect(requestsPage.fulfilButton(id)).toBeVisible();
    await expect(requestsPage.approveButton(id)).toHaveCount(0);
  });

  test('TC-31 invalid amount shows the API error message', async ({ requestsPage }) => {
    await requestsPage.submitForm(settings.activeCustomerId, 'UI invalid amount', '0');

    await expect(requestsPage.formError).toContainText('Amount must be between 0.01 and 10000.00');
  });

  test('TC-32 large request can be approved and fulfilled from the table', async ({ requestsPage }) => {
    const id = await requestsPage.create(settings.activeCustomerId, 'UI storage array', 6200);
    await requestsPage.expectStatus(id, 'PendingApproval');

    await requestsPage.approveButton(id).click();
    await requestsPage.expectStatus(id, 'Approved');

    await requestsPage.fulfilButton(id).click();
    await requestsPage.expectStatus(id, 'Fulfilled');
  });
});
