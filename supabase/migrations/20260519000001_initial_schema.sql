-- =============================================================================
-- Cinqa Invoice Generator — Initial Schema
-- Migration: 20260519000001_initial_schema
--
-- Replaces: Airtable (clients, invoices, invoice_line_items, invoice_sequences)
-- Adds:     organizations (multi-tenancy root)
--           pdf_storage_path / pdf_generated_at (async PDF — Phase 6)
--           proper FK between line_items → invoices (vs. string join on invoice_no)
--           atomic invoice sequence via PostgreSQL function (vs. n8n read-then-write)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Organizations  (multi-tenancy root — single org in phases 4-8)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organizations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  slug       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_key UNIQUE (slug)
);

-- ---------------------------------------------------------------------------
-- 2. Clients
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clients (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name                       text        NOT NULL,
  gstin                      text        NOT NULL,
  state                      text        NOT NULL,
  state_code                 integer     NOT NULL,
  address_line_1             text        NOT NULL DEFAULT '',
  address_line_2             text        NOT NULL DEFAULT '',
  address_line_3             text        NOT NULL DEFAULT '',
  default_sac                text        NOT NULL DEFAULT '',
  default_payment_terms_days integer     NOT NULL DEFAULT 10,
  email                      text        NOT NULL DEFAULT '',
  phone                      text        NOT NULL DEFAULT '',
  notes                      text        NOT NULL DEFAULT '',
  active                     boolean     NOT NULL DEFAULT true,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  -- GSTIN is unique per organization
  CONSTRAINT clients_org_gstin_key UNIQUE (organization_id, gstin)
);

CREATE INDEX IF NOT EXISTS idx_clients_org_active
  ON clients (organization_id, active);

CREATE INDEX IF NOT EXISTS idx_clients_org_name
  ON clients (organization_id, lower(name));

-- ---------------------------------------------------------------------------
-- 3. Invoice sequences  (replaces Airtable invoice_sequences table)
--    Atomic increment via next_invoice_sequence() — no race condition
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoice_sequences (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  financial_year  text        NOT NULL,           -- e.g. '26-27'
  invoice_type    text        NOT NULL,
  last_sequence   integer     NOT NULL DEFAULT 0,
  last_invoice_no text        NOT NULL DEFAULT '',
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_sequences_org_fy_type_key
    UNIQUE (organization_id, financial_year, invoice_type),
  CONSTRAINT invoice_sequences_type_check
    CHECK (invoice_type IN ('tax', 'proforma'))
);

-- ---------------------------------------------------------------------------
-- 4. Invoices
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoices (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,

  -- Identity
  invoice_no           text        NOT NULL,
  idempotency_key      text        NOT NULL,
  invoice_type         text        NOT NULL,
  show_quantity        boolean     NOT NULL DEFAULT false,
  include_due_date     boolean     NOT NULL DEFAULT true,

  -- Dates
  invoice_date         date        NOT NULL,
  due_date             date,

  -- Client snapshot (denormalized for PDF rendering without a JOIN)
  client_id            uuid        REFERENCES clients (id),
  client_name          text        NOT NULL DEFAULT '',
  gstin                text        NOT NULL DEFAULT '',
  state                text        NOT NULL DEFAULT '',
  state_code           integer     NOT NULL DEFAULT 0,
  place_of_supply      text        NOT NULL DEFAULT '',

  -- Tax
  gst_type             text        NOT NULL DEFAULT '',
  amount               numeric(14, 2) NOT NULL DEFAULT 0,
  cgst                 numeric(14, 2) NOT NULL DEFAULT 0,
  sgst                 numeric(14, 2) NOT NULL DEFAULT 0,
  igst                 numeric(14, 2) NOT NULL DEFAULT 0,
  total                numeric(14, 2) NOT NULL DEFAULT 0,
  sac                  text        NOT NULL DEFAULT '',
  reverse_charge       text        NOT NULL DEFAULT 'No',

  -- Status lifecycle
  status               text        NOT NULL DEFAULT 'generated',

  -- Display fields
  total_in_words       text        NOT NULL DEFAULT '',
  payment_terms_label  text        NOT NULL DEFAULT '',

  -- Proforma conversion metadata
  source_proforma_id   uuid        REFERENCES invoices (id),
  source_proforma_no   text,
  source_proforma_date date,
  purchase_order_number text,
  purchase_order_date  date,

  -- PDF (Phase 6 — async generation)
  pdf_storage_path     text,                      -- e.g. 'cinqa/rec123/CTS-26-27-INV001.pdf'
  pdf_generated_at     timestamptz,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invoices_org_invoice_no_key   UNIQUE (organization_id, invoice_no),
  CONSTRAINT invoices_org_idempotency_key  UNIQUE (organization_id, idempotency_key),
  CONSTRAINT invoices_type_check           CHECK (invoice_type IN ('tax', 'proforma')),
  CONSTRAINT invoices_status_check         CHECK (status IN ('generated', 'pending', 'sent', 'paid', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_invoices_org_date
  ON invoices (organization_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_org_status
  ON invoices (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_org_client_id
  ON invoices (organization_id, client_id);

CREATE INDEX IF NOT EXISTS idx_invoices_org_client_name
  ON invoices (organization_id, lower(client_name));

-- ---------------------------------------------------------------------------
-- 5. Invoice line items
--    Linked by invoice_id FK — not by invoice_no string (Airtable workaround removed)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid           NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  invoice_id      uuid           NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  line_number     integer        NOT NULL,
  description     text           NOT NULL,
  sac             text           NOT NULL DEFAULT '',
  quantity        numeric(14, 4),
  unit_price      numeric(14, 2),
  amount          numeric(14, 2) NOT NULL DEFAULT 0,
  taxable_value   numeric(14, 2) NOT NULL DEFAULT 0,
  cgst            numeric(14, 2) NOT NULL DEFAULT 0,
  sgst            numeric(14, 2) NOT NULL DEFAULT 0,
  igst            numeric(14, 2) NOT NULL DEFAULT 0,
  total           numeric(14, 2) NOT NULL DEFAULT 0,
  created_at      timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT line_items_invoice_line_key UNIQUE (invoice_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_line_items_invoice_id
  ON invoice_line_items (invoice_id);

-- ---------------------------------------------------------------------------
-- 6. updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_clients_updated_at' AND tgrelid = 'clients'::regclass
  ) THEN
    CREATE TRIGGER trg_clients_updated_at
      BEFORE UPDATE ON clients
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_invoices_updated_at' AND tgrelid = 'invoices'::regclass
  ) THEN
    CREATE TRIGGER trg_invoices_updated_at
      BEFORE UPDATE ON invoices
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_invoice_sequences_updated_at' AND tgrelid = 'invoice_sequences'::regclass
  ) THEN
    CREATE TRIGGER trg_invoice_sequences_updated_at
      BEFORE UPDATE ON invoice_sequences
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Helper: financial year label from a date
--    Matches the JavaScript getFinancialYearLabel() — FY starts 1 April
--    financial_year_label('2026-04-01') → '26-27'
--    financial_year_label('2026-03-31') → '25-26'
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION financial_year_label(p_date date)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT
    CASE
      WHEN EXTRACT(MONTH FROM p_date) >= 4
      THEN to_char(p_date,                  'YY') || '-' ||
           to_char(p_date + interval '1 year', 'YY')
      ELSE to_char(p_date - interval '1 year', 'YY') || '-' ||
           to_char(p_date,                  'YY')
    END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Helper: build invoice number from parts
--    Matches buildInvoiceNumber() in src/services/invoice-number.js
--    build_invoice_number('2026-04-15', 3, 'tax')    → 'CTS/26-27/INV003'
--    build_invoice_number('2026-04-15', 1, 'proforma') → 'CTS/26-27/PI001'
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION build_invoice_number(
  p_date         date,
  p_sequence     integer,
  p_invoice_type text,
  p_prefix       text DEFAULT 'CTS'
)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT
    p_prefix || '/' ||
    financial_year_label(p_date) || '/' ||
    CASE WHEN p_invoice_type = 'proforma' THEN 'PI' ELSE 'INV' END ||
    lpad(p_sequence::text, 3, '0');
$$;

-- ---------------------------------------------------------------------------
-- 9. Atomic invoice sequence  (replaces n8n read-then-write sequence logic)
--
--    Uses INSERT … ON CONFLICT DO UPDATE so the increment is a single
--    atomic operation — no gap or duplicate even under concurrent writes.
--
--    Usage:
--      SELECT next_invoice_sequence(org_id, '26-27', 'tax');  → 1, 2, 3 …
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION next_invoice_sequence(
  p_organization_id uuid,
  p_financial_year  text,
  p_invoice_type    text
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_sequence integer;
BEGIN
  INSERT INTO invoice_sequences
    (organization_id, financial_year, invoice_type, last_sequence)
  VALUES
    (p_organization_id, p_financial_year, p_invoice_type, 1)
  ON CONFLICT (organization_id, financial_year, invoice_type)
  DO UPDATE SET
    last_sequence = invoice_sequences.last_sequence + 1,
    updated_at    = now()
  RETURNING last_sequence
  INTO v_sequence;

  RETURN v_sequence;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Convenience view: invoice list (mirrors Airtable listInvoices response)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW invoice_list AS
SELECT
  i.id,
  i.organization_id,
  i.invoice_no,
  i.idempotency_key,
  i.invoice_type,
  i.show_quantity,
  i.include_due_date,
  i.invoice_date,
  i.due_date,
  i.client_id,
  i.client_name,
  i.gstin,
  i.state,
  i.state_code,
  i.place_of_supply,
  i.gst_type,
  i.amount,
  i.cgst,
  i.sgst,
  i.igst,
  i.total,
  i.sac,
  i.reverse_charge,
  i.status,
  i.total_in_words,
  i.payment_terms_label,
  i.source_proforma_id,
  i.source_proforma_no,
  i.source_proforma_date,
  i.purchase_order_number,
  i.purchase_order_date,
  i.pdf_storage_path,
  i.pdf_generated_at,
  i.created_at,
  i.updated_at
FROM invoices i
ORDER BY i.invoice_date DESC, i.created_at DESC;

-- ---------------------------------------------------------------------------
-- 11. RLS — enabled now, user-level policies added in Phase 9
--     The app server uses the service_role key which bypasses RLS in Supabase.
--     Enable now so Phase 9 policies slot in without schema changes.
-- ---------------------------------------------------------------------------

ALTER TABLE organizations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_sequences  ENABLE ROW LEVEL SECURITY;

-- Phase 9 will add per-organization user policies here:
-- CREATE POLICY "users_own_org" ON clients
--   USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
