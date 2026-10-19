import { test, expect } from '../../src/fixtures.js';
import { aServiceRequest } from '../../src/data/service-request-builder.js';

/**
 * R6-R7: database validation. The API response isn't proof: these tests check what was
 * persisted. pg returns NUMERIC as strings, so amounts are compared exactly ('1500.00').
 */
test.describe('Invoicing and audit (database)', () => {
  // VAT 20%, half away from zero: 0.13 * 0.2 = 0.026 -> 0.03; 5000.01 * 0.2 = 1000.002 -> 1000.00
  for (const [id, amount, net, vat, gross] of [
    ['TC-22', 0.13, '0.13', '0.03', '0.16'],
    ['TC-23', 430.5, '430.50', '86.10', '516.60'],
    ['TC-24', 5000.01, '5000.01', '1000.00', '6000.01'],
    ['TC-25', 10000, '10000.00', '2000.00', '12000.00'],
  ] as const) {
    test(`${id} fulfilment persists an invoice for ${amount} with 20% VAT`, async ({ api, db }) => {
      const approved = await api.createApproved(aServiceRequest().withAmount(amount).build());
      await api.fulfil(approved.id);

      const invoices = await db.invoices(approved.id);

      expect(invoices).toHaveLength(1);
      expect(invoices[0]).toMatchObject({ net, vat, gross });
    });
  }

  test('TC-26 API invoice matches the database invoice', async ({ api, db }) => {
    const approved = await api.createApproved(aServiceRequest().withAmount(1234.56).build());
    await api.fulfil(approved.id);

    const fromApi = (await api.invoiceFor(approved.id)).body;
    const [fromDb] = await db.invoices(approved.id);

    expect(fromDb).toBeDefined();
    expect(fromApi).toMatchObject({
      id: fromDb!.id,
      net: Number(fromDb!.net),
      vat: Number(fromDb!.vat),
      gross: Number(fromDb!.gross),
    });
  });

  test('TC-27 audit trail records every transition in order', async ({ api, db }) => {
    const created = await api.createOrThrow(aServiceRequest().needingApproval().build());
    await api.approve(created.id);
    await api.fulfil(created.id);

    const trail = (await db.auditTrail(created.id)).map(a => `${a.fromStatus ?? '-'}>${a.toStatus}`);

    expect(trail).toEqual(['->PendingApproval', 'PendingApproval>Approved', 'Approved>Fulfilled']);
  });

  test('TC-28 a rejected request never gets an invoice', async ({ api, db }) => {
    const created = await api.createOrThrow(aServiceRequest().needingApproval().build());
    await api.reject(created.id, 'Not needed');

    const fulfil = await api.fulfil(created.id);

    expect(fulfil.status).toBe(409);
    expect(await db.invoices(created.id)).toEqual([]);
  });

  test('TC-29 integrity sweep: no fulfilled request without an invoice', { tag: '@smoke' }, async ({ db }) => {
    expect(await db.countFulfilledWithoutInvoice()).toBe(0);
  });
});
