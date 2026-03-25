CREATE TABLE IF NOT EXISTS finance_chart_of_accounts (
  id SERIAL PRIMARY KEY,
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(140) NOT NULL,
  account_type VARCHAR(40) NOT NULL
    CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'COGS')),
  detail_type VARCHAR(60) NOT NULL DEFAULT 'OTHER',
  parent_account_id INT REFERENCES finance_chart_of_accounts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_vendors (
  id SERIAL PRIMARY KEY,
  vendor_name VARCHAR(160) NOT NULL,
  email VARCHAR(180),
  phone VARCHAR(60),
  tax_number VARCHAR(80),
  payment_terms VARCHAR(80),
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_tax_rates (
  id SERIAL PRIMARY KEY,
  tax_name VARCHAR(120) UNIQUE NOT NULL,
  rate_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  tax_scope VARCHAR(20) NOT NULL DEFAULT 'BOTH'
    CHECK (tax_scope IN ('SALES', 'PURCHASE', 'BOTH')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SENT', 'PARTIAL', 'PAID', 'VOID')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_invoice_lines (
  id SERIAL PRIMARY KEY,
  invoice_id INT NOT NULL REFERENCES finance_invoices(id) ON DELETE CASCADE,
  description VARCHAR(220) NOT NULL,
  qty NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate_id INT REFERENCES finance_tax_rates(id) ON DELETE SET NULL,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_bills (
  id SERIAL PRIMARY KEY,
  bill_number VARCHAR(50) UNIQUE NOT NULL,
  vendor_id INT NOT NULL REFERENCES finance_vendors(id) ON DELETE CASCADE,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'PARTIAL', 'PAID', 'VOID')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_bill_lines (
  id SERIAL PRIMARY KEY,
  bill_id INT NOT NULL REFERENCES finance_bills(id) ON DELETE CASCADE,
  description VARCHAR(220) NOT NULL,
  qty NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate_id INT REFERENCES finance_tax_rates(id) ON DELETE SET NULL,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_bank_transactions (
  id SERIAL PRIMARY KEY,
  payment_account_id INT NOT NULL REFERENCES payment_accounts(id) ON DELETE CASCADE,
  tx_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tx_type VARCHAR(20) NOT NULL CHECK (tx_type IN ('MONEY_IN', 'MONEY_OUT', 'TRANSFER')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  reference_no VARCHAR(80),
  payee_name VARCHAR(160),
  memo TEXT,
  match_type VARCHAR(20) NOT NULL DEFAULT 'UNMATCHED'
    CHECK (match_type IN ('UNMATCHED', 'MATCHED', 'EXCLUDED')),
  matched_entity_type VARCHAR(20),
  matched_entity_id INT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_reconciliations (
  id SERIAL PRIMARY KEY,
  payment_account_id INT NOT NULL REFERENCES payment_accounts(id) ON DELETE CASCADE,
  statement_ending_date DATE NOT NULL,
  statement_ending_balance NUMERIC(12,2) NOT NULL,
  system_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  difference NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CLOSED')),
  closed_by INT REFERENCES users(id),
  closed_at TIMESTAMP,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO finance_chart_of_accounts (code, name, account_type, detail_type)
VALUES
  ('1000', 'Cash on Hand', 'ASSET', 'CASH'),
  ('1100', 'Bank Account', 'ASSET', 'BANK'),
  ('1200', 'Accounts Receivable', 'ASSET', 'ACCOUNTS_RECEIVABLE'),
  ('2000', 'Accounts Payable', 'LIABILITY', 'ACCOUNTS_PAYABLE'),
  ('4000', 'Sales Revenue', 'REVENUE', 'SALES'),
  ('5000', 'Cost of Goods Sold', 'COGS', 'COGS'),
  ('6100', 'Operating Expense', 'EXPENSE', 'OPERATING_EXPENSE')
ON CONFLICT (code) DO NOTHING;

INSERT INTO finance_tax_rates (tax_name, rate_percent, tax_scope)
VALUES
  ('VAT 5%', 5.0, 'BOTH'),
  ('VAT 15%', 15.0, 'BOTH'),
  ('Zero Rated', 0.0, 'BOTH')
ON CONFLICT (tax_name) DO NOTHING;
