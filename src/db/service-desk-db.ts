import pg from 'pg';

// pg returns NUMERIC as a string ("1500.00"), so money is compared exactly, never as a float.
export interface RequestRecord { id: number; customerId: number; title: string; amount: string; status: string }
export interface InvoiceRecord { id: number; requestId: number; net: string; vat: string; gross: string }
export interface AuditRecord { id: number; requestId: number; fromStatus: string | null; toStatus: string }

/**
 * Read-only database checks for tests. Always parameterised ($1), never string-concatenated SQL.
 */
export class ServiceDeskDb {
  constructor(private readonly pool: pg.Pool) {}

  async request(id: number): Promise<RequestRecord | undefined> {
    const { rows } = await this.pool.query<RequestRecord>(
      `SELECT id, customer_id AS "customerId", title, amount, status FROM service_requests WHERE id = $1`, [id]);
    return rows[0];
  }

  async invoices(requestId: number): Promise<InvoiceRecord[]> {
    const { rows } = await this.pool.query<InvoiceRecord>(
      `SELECT id, request_id AS "requestId", net, vat, gross FROM invoices WHERE request_id = $1`, [requestId]);
    return rows;
  }

  async auditTrail(requestId: number): Promise<AuditRecord[]> {
    const { rows } = await this.pool.query<AuditRecord>(
      `SELECT id, request_id AS "requestId", from_status AS "fromStatus", to_status AS "toStatus"
       FROM audit_log WHERE request_id = $1 ORDER BY changed_at, id`, [requestId]);
    return rows;
  }

  /** Integrity sweep: fulfilled requests with no invoice. Must always be 0. */
  async countFulfilledWithoutInvoice(): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM service_requests r
       LEFT JOIN invoices i ON i.request_id = r.id
       WHERE r.status = 'Fulfilled' AND i.id IS NULL`);
    return Number(rows[0]!.count);
  }
}
