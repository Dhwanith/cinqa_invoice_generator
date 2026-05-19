-- =============================================================================
-- Accounting Module — Phase D
-- Migration: 20260519000009_accounting
--
-- Tables:
--   accounts        — Chart of Accounts (pre-populated via seed-accounts.sql)
--   journal_entries — Manual adjusting entries (depreciation, opening bal, etc.)
--   journal_lines   — Double-entry lines per journal entry
--   bank_balances   — Manual bank balance log (Axis Bank API in future phase)
--   capital_entries — Partners' opening balance + drawings for Balance Sheet
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Chart of Accounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS accounts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code            text        NOT NULL,
  name            text        NOT NULL,
  type            text        NOT NULL,
  sub_type        text        NOT NULL DEFAULT '',
  description     text        NOT NULL DEFAULT '',
  active          boolean     NOT NULL DEFAULT true,
  is_system       boolean     NOT NULL DEFAULT false,
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_type_check CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  CONSTRAINT accounts_org_code_key UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_accounts_org_type ON accounts (organization_id, type, sort_order);

-- ---------------------------------------------------------------------------
-- 2. Journal entries (manual adjustments — depreciation, opening bal, etc.)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS journal_entries (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entry_no        text        NOT NULL DEFAULT '',
  date            date        NOT NULL,
  description     text        NOT NULL,
  entry_type      text        NOT NULL DEFAULT 'manual',
  source_type     text,
  source_id       uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT je_entry_type_check CHECK (entry_type IN ('manual', 'auto'))
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date ON journal_entries (organization_id, date DESC);

-- ---------------------------------------------------------------------------
-- 3. Journal lines (double-entry)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS journal_lines (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid           NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  organization_id  uuid           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id       uuid           NOT NULL REFERENCES accounts(id),
  debit            numeric(14,2)  NOT NULL DEFAULT 0,
  credit           numeric(14,2)  NOT NULL DEFAULT 0,
  description      text           NOT NULL DEFAULT '',
  created_at       timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT jl_check CHECK (NOT (debit > 0 AND credit > 0))  -- one side per line
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines (account_id);

-- ---------------------------------------------------------------------------
-- 4. Bank balances (manual log — Axis Bank API in a future phase)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bank_balances (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date            date           NOT NULL,
  balance         numeric(14,2)  NOT NULL DEFAULT 0,
  notes           text           NOT NULL DEFAULT '',
  created_at      timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_balances_org_date ON bank_balances (organization_id, date DESC);

-- ---------------------------------------------------------------------------
-- 5. Capital entries (partners' opening balance + drawings)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS capital_entries (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date             date           NOT NULL,
  opening_balance  numeric(14,2)  NOT NULL DEFAULT 0,
  drawings         numeric(14,2)  NOT NULL DEFAULT 0,
  notes            text           NOT NULL DEFAULT '',
  created_at       timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capital_entries_org_date ON capital_entries (organization_id, date DESC);

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_balances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_access_accounts"
ON accounts FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "org_members_access_journal_entries"
ON journal_entries FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "org_members_access_journal_lines"
ON journal_lines FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "org_members_access_bank_balances"
ON bank_balances FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "org_members_access_capital_entries"
ON capital_entries FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));
