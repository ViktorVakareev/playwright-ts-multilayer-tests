import { test, expect } from '../../src/fixtures.js';
import { settings } from '../../src/settings.js';

/**
 * Critical business process, end to end across all layers:
 *   submit in the UI -> manager approves via the API -> fulfil in the UI
 *   -> invoice correct in the API and the database -> audit trail complete.
 */
test('TC-33 large request goes from UI submission to a correct invoice', { tag: ['@smoke', '@e2e'] }, async ({ requestsPage, api, db, page }) => {
  let id = 0;

  await test.step('Requester submits the request in the UI', async () => {
    id = await requestsPage.create(settings.activeCustomerId, 'E2E backup appliance', 8250.75);
    await requestsPage.expectStatus(id, 'PendingApproval');
  });

  await test.step('Manager approves through the API', async () => {
    expect((await api.approve(id)).status).toBe(200);
  });

  await test.step('Fulfiller completes the request in the UI', async () => {
    await page.reload();
    await requestsPage.fulfilButton(id).click();
    await requestsPage.expectStatus(id, 'Fulfilled');
  });

  await test.step('Invoice is correct in the API and the database', async () => {
    const invoice = await api.invoiceFor(id);
    expect(invoice.status).toBe(200);
    expect(invoice.body).toMatchObject({ net: 8250.75, vat: 1650.15, gross: 9900.9 });

    expect(await db.invoices(id)).toEqual([
      expect.objectContaining({ net: '8250.75', vat: '1650.15', gross: '9900.90' }),
    ]);
    expect((await db.auditTrail(id)).map(a => a.toStatus)).toEqual(['PendingApproval', 'Approved', 'Fulfilled']);
  });
});
