// System under test: a tiny "service request -> approval -> fulfilment -> invoice" app (Express + PostgreSQL).
// Business rules the tests check:
//   R1  amount must be 0.01 .. 10000.00 with at most 2 decimals
//   R2  title must be 3 .. 100 characters after trimming
//   R3  customer must exist and be active
//   R4  amount <= 5000.00 is approved automatically, > 5000.00 waits for approval
//   R5  allowed transitions: PendingApproval -> Approved | Rejected, Approved -> Fulfilled
//   R6  fulfilment creates exactly one invoice: VAT 20%, rounded half away from zero (done in SQL, NUMERIC)
//   R7  every status change writes one audit_log row in the same transaction
import express, { type Request, type Response } from 'express';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT ?? 5080);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://qa:qa@localhost:5432/servicedesk',
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')));

const SELECT_REQUEST = `
  SELECT id, customer_id AS "customerId", title, amount, status, reject_reason AS "rejectReason",
         created_at AS "createdAt", updated_at AS "updatedAt"
  FROM service_requests`;

type RequestRow = {
  id: number;
  customerId: number;
  title: string;
  amount: string; // pg returns NUMERIC as string, so money stays exact
  status: string;
  rejectReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// JSON contract: amount as a number (same as the .NET version of this app).
const toJson = (row: RequestRow) => ({ ...row, amount: Number(row.amount) });
const error = (res: Response, status: number, message: string): void => {
  res.status(status).json({ error: message });
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/customers', async (_req, res) => {
  const { rows } = await pool.query('SELECT id, name, is_active AS "isActive" FROM customers ORDER BY id');
  res.json(rows);
});

app.get('/api/requests', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const { rows } = status
    ? await pool.query<RequestRow>(`${SELECT_REQUEST} WHERE status = $1 ORDER BY id DESC`, [status])
    : await pool.query<RequestRow>(`${SELECT_REQUEST} ORDER BY id DESC`);
  res.json(rows.map(toJson));
});

app.get('/api/requests/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query<RequestRow>(`${SELECT_REQUEST} WHERE id = $1`, [id]);
  if (rows.length === 0) {
    return error(res, 404, `Request ${id} not found`);
  }
  res.json(toJson(rows[0]!));
});

app.post('/api/requests', async (req: Request, res: Response) => {
  const { customerId, title: rawTitle, amount } = req.body ?? {};
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  if (title.length < 3 || title.length > 100) {
    return error(res, 400, 'Title must be 3-100 characters');
  }
  // Validate on the string form so 12.345 is rejected exactly (no floating-point tricks).
  const amountText = typeof amount === 'number' ? String(amount) : '';
  if (!/^\d+(\.\d{1,2})?$/.test(amountText) || Number(amountText) <= 0 || Number(amountText) > 10000) {
    return error(res, 400, 'Amount must be between 0.01 and 10000.00 with at most 2 decimals');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const customer = await client.query<{ is_active: boolean }>('SELECT is_active FROM customers WHERE id = $1', [customerId]);
    if (customer.rows.length === 0) {
      await client.query('ROLLBACK');
      return error(res, 400, `Customer ${customerId} does not exist`);
    }
    if (!customer.rows[0]!.is_active) {
      await client.query('ROLLBACK');
      return error(res, 400, `Customer ${customerId} is inactive`);
    }
    const status = Number(amountText) <= 5000 ? 'Approved' : 'PendingApproval';
    const inserted = await client.query<{ id: number }>(
      'INSERT INTO service_requests (customer_id, title, amount, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [customerId, title, amountText, status],
    );
    const id = inserted.rows[0]!.id;
    await client.query('INSERT INTO audit_log (request_id, from_status, to_status) VALUES ($1, NULL, $2)', [id, status]);
    await client.query('COMMIT');

    const created = await client.query<RequestRow>(`${SELECT_REQUEST} WHERE id = $1`, [id]);
    res.status(201).location(`/api/requests/${id}`).json(toJson(created.rows[0]!));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

async function transition(
  res: Response,
  id: number,
  fromStatus: string,
  toStatus: string,
  options: { reason?: string; createInvoice?: boolean } = {},
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // FOR UPDATE locks the row, so two parallel "fulfil" calls can't both create an invoice.
    const current = await client.query<RequestRow>(`${SELECT_REQUEST} WHERE id = $1 FOR UPDATE`, [id]);
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return error(res, 404, `Request ${id} not found`);
    }
    const row = current.rows[0]!;
    if (row.status !== fromStatus) {
      await client.query('ROLLBACK');
      return error(res, 409, `Cannot move request ${id} from ${row.status} to ${toStatus}`);
    }
    await client.query(
      'UPDATE service_requests SET status = $2, reject_reason = $3, updated_at = now() WHERE id = $1',
      [id, toStatus, options.reason ?? null],
    );
    await client.query('INSERT INTO audit_log (request_id, from_status, to_status) VALUES ($1, $2, $3)', [id, fromStatus, toStatus]);
    if (options.createInvoice) {
      // NUMERIC arithmetic in SQL: exact, and round() is half away from zero.
      await client.query(
        `INSERT INTO invoices (request_id, net, vat, gross)
         SELECT id, amount, round(amount * 0.20, 2), amount + round(amount * 0.20, 2)
         FROM service_requests WHERE id = $1`,
        [id],
      );
    }
    await client.query('COMMIT');
    const updated = await client.query<RequestRow>(`${SELECT_REQUEST} WHERE id = $1`, [id]);
    res.json(toJson(updated.rows[0]!));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

app.post('/api/requests/:id/approve', (req, res) =>
  transition(res, Number(req.params.id), 'PendingApproval', 'Approved'));

app.post('/api/requests/:id/reject', (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length === 0) {
    return error(res, 400, 'A reject reason is required');
  }
  return transition(res, Number(req.params.id), 'PendingApproval', 'Rejected', { reason });
});

app.post('/api/requests/:id/fulfil', (req, res) =>
  transition(res, Number(req.params.id), 'Approved', 'Fulfilled', { createInvoice: true }));

app.get('/api/invoices/by-request/:requestId', async (req, res) => {
  const requestId = Number(req.params.requestId);
  const { rows } = await pool.query<{ id: number; requestId: number; net: string; vat: string; gross: string }>(
    'SELECT id, request_id AS "requestId", net, vat, gross, issued_at AS "issuedAt" FROM invoices WHERE request_id = $1',
    [requestId],
  );
  if (rows.length === 0) {
    return error(res, 404, `No invoice for request ${requestId}`);
  }
  const invoice = rows[0]!;
  res.json({ ...invoice, net: Number(invoice.net), vat: Number(invoice.vat), gross: Number(invoice.gross) });
});

app.listen(port, () => {
  console.log(`Service Requests app listening on http://localhost:${port}`);
});
