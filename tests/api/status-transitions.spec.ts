import { test, expect } from '../../src/fixtures.js';
import { aServiceRequest } from '../../src/data/service-request-builder.js';

/**
 * R5: state transition testing. Every valid transition once; every invalid one returns 409
 * and changes nothing in the database.
 */
test.describe('Status transitions', () => {
  test('TC-13 pending request can be approved, then fulfilled', { tag: '@smoke' }, async ({ api }) => {
    const created = await api.createOrThrow(aServiceRequest().needingApproval().build());

    const approved = await api.approve(created.id);
    const fulfilled = await api.fulfil(created.id);

    expect(created.status).toBe('PendingApproval');
    expect(approved.body.status).toBe('Approved');
    expect(fulfilled.body.status).toBe('Fulfilled');
  });

  test('TC-14 pending request can be rejected with a reason', async ({ api }) => {
    const created = await api.createOrThrow(aServiceRequest().needingApproval().build());

    const rejected = await api.reject(created.id, 'Over budget');

    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({ status: 'Rejected', rejectReason: 'Over budget' });
  });

  test('TC-15 reject without a reason returns 400 and keeps the status', async ({ api, db }) => {
    const created = await api.createOrThrow(aServiceRequest().needingApproval().build());

    const result = await api.reject(created.id, '   ');

    expect(result.status).toBe(400);
    expect((await db.request(created.id))?.status).toBe('PendingApproval');
  });

  // The empty cells of the state-transition table.
  for (const { id, amount, action } of [
    { id: 'TC-16', amount: 1200, action: 'approve' },
    { id: 'TC-17', amount: 7500, action: 'fulfil' },
    { id: 'TC-18', amount: 1200, action: 'reject' },
  ] as const) {
    test(`${id} invalid "${action}" returns 409 and changes nothing`, async ({ api, db }) => {
      const created = await api.createOrThrow(aServiceRequest().withAmount(amount).build());
      const auditBefore = await db.auditTrail(created.id);

      const result =
        action === 'approve' ? await api.approve(created.id)
        : action === 'fulfil' ? await api.fulfil(created.id)
        : await api.reject(created.id, 'test');

      expect(result.status).toBe(409);
      expect(result.body.error).toMatch(/^Cannot move request/);
      expect((await db.request(created.id))?.status, 'status must not change').toBe(created.status);
      expect(await db.auditTrail(created.id), 'no audit row for a refused change').toHaveLength(auditBefore.length);
    });
  }

  test('TC-19 fulfilling twice returns 409 and creates one invoice', async ({ api, db }) => {
    const approved = await api.createApproved(aServiceRequest().withAmount(300).build());

    const first = await api.fulfil(approved.id);
    const second = await api.fulfil(approved.id);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(await db.invoices(approved.id)).toHaveLength(1);
  });

  test('TC-20 five concurrent fulfil calls create exactly one invoice', async ({ api, db }) => {
    const approved = await api.createApproved(aServiceRequest().withAmount(450).build());

    const results = await Promise.all(Array.from({ length: 5 }, () => api.fulfil(approved.id)));
    const statuses = results.map(r => r.status).sort();

    expect(statuses).toEqual([200, 409, 409, 409, 409]);
    expect(await db.invoices(approved.id)).toHaveLength(1);
  });

  test('TC-21 unknown request returns 404', async ({ api }) => {
    expect((await api.approve(2_147_483_647)).status).toBe(404);
  });
});
