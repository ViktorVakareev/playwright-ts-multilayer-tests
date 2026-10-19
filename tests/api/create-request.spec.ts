import { test, expect } from '../../src/fixtures.js';
import { aServiceRequest } from '../../src/data/service-request-builder.js';
import { settings } from '../../src/settings.js';

/**
 * R1-R4: validation and initial status. Boundary values and equivalence classes
 * come straight from the test plan (TC-01 .. TC-12).
 */
test.describe('Create service request', () => {
  test('TC-01 valid request returns 201 with a Location header', { tag: '@smoke' }, async ({ api }) => {
    const body = aServiceRequest().withAmount(250).build();

    const result = await api.create(body);

    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ title: body.title, amount: 250, status: 'Approved' });
    expect(result.headers['location']).toBe(`/api/requests/${result.body.id}`);
  });

  // Boundary value analysis around 0.01 (min), 5000.00 (approval threshold), 10000.00 (max).
  for (const [id, amount, expected] of [
    ['TC-02', 0.01, 'Approved'],
    ['TC-03', 5000, 'Approved'],
    ['TC-04', 5000.01, 'PendingApproval'],
    ['TC-05', 10000, 'PendingApproval'],
  ] as const) {
    test(`${id} amount ${amount} starts as ${expected}`, async ({ api }) => {
      const result = await api.create(aServiceRequest().withAmount(amount).build());

      expect(result.status).toBe(201);
      expect(result.body.status).toBe(expected);
    });
  }

  for (const [id, amount] of [['TC-06', 0], ['TC-07', -1], ['TC-08', 10000.01], ['TC-09', 12.345]] as const) {
    test(`${id} invalid amount ${amount} returns 400`, async ({ api }) => {
      const result = await api.create(aServiceRequest().withAmount(amount).build());

      expect(result.status).toBe(400);
      expect(result.body.error).toContain('Amount');
    });
  }

  for (const title of ['', 'ab', '   ', 'x'.repeat(101)]) {
    test(`TC-10 invalid title "${title.length > 10 ? `${title.length} chars` : title}" returns 400`, async ({ api }) => {
      const result = await api.create(aServiceRequest().withTitle(title).build());

      expect(result.status).toBe(400);
      expect(result.body.error).toContain('Title');
    });
  }

  test('TC-11 title length boundaries 3 and 100 are accepted', async ({ api }) => {
    const shortest = await api.create(aServiceRequest().withTitle('abc').build());
    const longest = await api.create(aServiceRequest().withTitle('x'.repeat(100)).build());

    expect.soft(shortest.status).toBe(201);
    expect.soft(longest.status).toBe(201);
  });

  test('TC-12 unknown or inactive customer is rejected', async ({ api }) => {
    const unknown = await api.create(aServiceRequest().forCustomer(999_999).build());
    const inactive = await api.create(aServiceRequest().forCustomer(settings.inactiveCustomerId).build());

    expect.soft(unknown.status).toBe(400);
    expect.soft(unknown.body.error).toContain('does not exist');
    expect.soft(inactive.status).toBe(400);
    expect.soft(inactive.body.error).toContain('inactive');
  });
});
