-- Service Request -> Approval -> Fulfilment -> Invoice
-- Schema and seed data for playwright-ts-multilayer-tests. All data is invented.
-- Runs automatically in the postgres container (docker-entrypoint-initdb.d)
-- or manually: psql -h localhost -U qa -d servicedesk -f db/init.sql

DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS service_requests;
DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
    id          SERIAL PRIMARY KEY,
    name        TEXT        NOT NULL,
    email       TEXT        NOT NULL UNIQUE,
    country     CHAR(2)     NOT NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE service_requests (
    id           SERIAL PRIMARY KEY,
    customer_id  INT           NOT NULL REFERENCES customers(id),
    title        TEXT          NOT NULL CHECK (char_length(title) BETWEEN 3 AND 100),
    amount       NUMERIC(10,2) NOT NULL CHECK (amount > 0 AND amount <= 10000),
    status       TEXT          NOT NULL CHECK (status IN
                   ('PendingApproval', 'Approved', 'Rejected', 'Fulfilled')),
    reject_reason TEXT,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
    id          SERIAL PRIMARY KEY,
    request_id  INT           NOT NULL UNIQUE REFERENCES service_requests(id),
    net         NUMERIC(10,2) NOT NULL,
    vat         NUMERIC(10,2) NOT NULL,
    gross       NUMERIC(10,2) NOT NULL,
    issued_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CHECK (gross = net + vat)
);

CREATE TABLE audit_log (
    id           SERIAL PRIMARY KEY,
    request_id   INT         NOT NULL REFERENCES service_requests(id),
    from_status  TEXT,                -- NULL for the creation event
    to_status    TEXT        NOT NULL,
    changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_service_requests_status ON service_requests(status);
CREATE INDEX ix_audit_log_request ON audit_log(request_id);

-- Seed data: automated tests create their own requests for customers 1 and 2;
-- the rows below are history for the SQL drills.
INSERT INTO customers (name, email, country, is_active) VALUES
    ('Northwind Traders',  'ops@northwind.example.com',  'DE', TRUE),   -- 1
    ('Contoso Logistics',  'it@contoso.example.com',     'BG', TRUE),   -- 2
    ('Fabrikam Retail',    'help@fabrikam.example.com',  'NL', FALSE),  -- 3 inactive, no requests
    ('Tailspin Toys',      'admin@tailspin.example.com', 'BG', TRUE);   -- 4 (owns the seeded audit defect, request 7)

INSERT INTO service_requests (customer_id, title, amount, status, reject_reason, created_at, updated_at) VALUES
    (1, 'Laptop replacement',          1200.00, 'Fulfilled',       NULL, now() - interval '20 days', now() - interval '18 days'),
    (1, 'Server rack upgrade',         8500.00, 'Fulfilled',       NULL, now() - interval '15 days', now() - interval '10 days'),
    (2, 'VPN licences x50',            4999.99, 'Approved',        NULL, now() - interval '7 days',  now() - interval '7 days'),
    (2, 'Data centre migration',       9800.00, 'PendingApproval', NULL, now() - interval '3 days',  now() - interval '3 days'),
    (2, 'Unbudgeted conference trip',  6100.00, 'Rejected',        'Not in budget', now() - interval '5 days', now() - interval '4 days'),
    (1, 'Monitor x2',                   430.50, 'Fulfilled',       NULL, now() - interval '2 days',  now() - interval '1 day');

-- Invoices for fulfilled requests (VAT 20%, rounded to 2 decimals)
INSERT INTO invoices (request_id, net, vat, gross, issued_at)
SELECT id, amount, round(amount * 0.20, 2), amount + round(amount * 0.20, 2), updated_at
FROM service_requests WHERE status = 'Fulfilled';

-- Audit trail matching the seeded states
INSERT INTO audit_log (request_id, from_status, to_status, changed_at)
SELECT id, NULL, CASE WHEN amount <= 5000 THEN 'Approved' ELSE 'PendingApproval' END, created_at
FROM service_requests;

INSERT INTO audit_log (request_id, from_status, to_status, changed_at)
SELECT id, 'PendingApproval', 'Approved', created_at + interval '1 day'
FROM service_requests WHERE amount > 5000 AND status IN ('Approved', 'Fulfilled');

INSERT INTO audit_log (request_id, from_status, to_status, changed_at)
SELECT id, 'PendingApproval', 'Rejected', updated_at
FROM service_requests WHERE status = 'Rejected';

INSERT INTO audit_log (request_id, from_status, to_status, changed_at)
SELECT id, 'Approved', 'Fulfilled', updated_at
FROM service_requests WHERE status = 'Fulfilled';

-- Deliberate data-quality defect for data-validation practice:
-- an Approved request whose audit trail is missing its approval event.
INSERT INTO service_requests (customer_id, title, amount, status, created_at, updated_at)
VALUES (4, 'Firewall appliance', 7200.00, 'Approved', now() - interval '1 day', now() - interval '1 day');
INSERT INTO audit_log (request_id, from_status, to_status, changed_at)
SELECT id, NULL, 'PendingApproval', created_at FROM service_requests WHERE title = 'Firewall appliance';
