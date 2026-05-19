-- =============================================================================
-- GST Module — Phase C
-- Migration: 20260519000008_gst_module
--
-- Tables:
--   gstr2b_imports   — tracks each GSTR-2B CSV import run
--   gstr2b_records   — individual records from imported GSTR-2B
--   gstr3b_returns   — computed GSTR-3B per period (saved + filed)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. GSTR-2B import runs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gstr2b_imports (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  financial_year  text        NOT NULL,    -- e.g. '26-27'
  month           integer     NOT NULL,    -- 1-12
  period_label    text        NOT NULL,    -- e.g. 'May 2026'
  filename        text        NOT NULL DEFAULT '',
  status          text        NOT NULL DEFAULT 'imported',
  total_records   integer     NOT NULL DEFAULT 0,
  matched_records integer     NOT NULL DEFAULT 0,
  total_itc_igst  numeric(14,2) NOT NULL DEFAULT 0,
  total_itc_cgst  numeric(14,2) NOT NULL DEFAULT 0,
  total_itc_sgst  numeric(14,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gstr2b_imports_status_check CHECK (status IN ('imported', 'reconciled'))
);

CREATE INDEX IF NOT EXISTS idx_gstr2b_imports_org ON gstr2b_imports (organization_id, financial_year, month);

-- ---------------------------------------------------------------------------
-- 2. GSTR-2B individual records (B2B invoices from suppliers' GSTR-1)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gstr2b_records (
  id                    uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id             uuid           NOT NULL REFERENCES gstr2b_imports(id) ON DELETE CASCADE,
  organization_id       uuid           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Supplier details
  supplier_gstin        text           NOT NULL,
  supplier_name         text           NOT NULL DEFAULT '',

  -- Invoice details
  invoice_no            text           NOT NULL,
  invoice_type          text           NOT NULL DEFAULT 'Regular',
  invoice_date          date,
  invoice_value         numeric(14,2)  NOT NULL DEFAULT 0,
  place_of_supply       text           NOT NULL DEFAULT '',
  reverse_charge        text           NOT NULL DEFAULT 'N',

  -- Tax amounts
  taxable_amount        numeric(14,2)  NOT NULL DEFAULT 0,
  igst                  numeric(14,2)  NOT NULL DEFAULT 0,
  cgst                  numeric(14,2)  NOT NULL DEFAULT 0,
  sgst                  numeric(14,2)  NOT NULL DEFAULT 0,
  cess                  numeric(14,2)  NOT NULL DEFAULT 0,

  -- ITC
  itc_available         text           NOT NULL DEFAULT 'Yes',  -- Yes / No / Ineligible
  reason                text           NOT NULL DEFAULT '',
  filing_period         text           NOT NULL DEFAULT '',

  -- Reconciliation
  reconciliation_status text           NOT NULL DEFAULT 'unmatched',
  matched_purchase_id   uuid           REFERENCES purchases(id),

  created_at            timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT gstr2b_recon_status_check CHECK (
    reconciliation_status IN ('matched', 'amount_mismatch', 'unmatched', 'manually_matched')
  )
);

CREATE INDEX IF NOT EXISTS idx_gstr2b_records_import
  ON gstr2b_records (import_id);
CREATE INDEX IF NOT EXISTS idx_gstr2b_records_gstin_invoice
  ON gstr2b_records (organization_id, supplier_gstin, invoice_no);
CREATE INDEX IF NOT EXISTS idx_gstr2b_records_status
  ON gstr2b_records (import_id, reconciliation_status);

-- ---------------------------------------------------------------------------
-- 3. GSTR-3B computed returns
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gstr3b_returns (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  financial_year  text           NOT NULL,   -- '26-27'
  month           integer        NOT NULL,   -- 1-12
  period_label    text           NOT NULL,   -- 'May 2026'
  status          text           NOT NULL DEFAULT 'draft',

  -- 3.1(a) Outward taxable supplies (from invoices)
  outward_taxable_value  numeric(14,2) NOT NULL DEFAULT 0,
  outward_igst           numeric(14,2) NOT NULL DEFAULT 0,
  outward_cgst           numeric(14,2) NOT NULL DEFAULT 0,
  outward_sgst           numeric(14,2) NOT NULL DEFAULT 0,

  -- 3.1(b) Zero-rated outward (N/A for Cinqa)
  zero_rated_value       numeric(14,2) NOT NULL DEFAULT 0,

  -- 3.1(d) Inward supplies under RCM
  rcm_taxable_value      numeric(14,2) NOT NULL DEFAULT 0,
  rcm_igst               numeric(14,2) NOT NULL DEFAULT 0,
  rcm_cgst               numeric(14,2) NOT NULL DEFAULT 0,
  rcm_sgst               numeric(14,2) NOT NULL DEFAULT 0,

  -- 4A(5) ITC available — from eligible purchases + reimbursements
  itc_igst               numeric(14,2) NOT NULL DEFAULT 0,
  itc_cgst               numeric(14,2) NOT NULL DEFAULT 0,
  itc_sgst               numeric(14,2) NOT NULL DEFAULT 0,

  -- 4B ITC reversed (restricted/blocked)
  itc_reversed_igst      numeric(14,2) NOT NULL DEFAULT 0,
  itc_reversed_cgst      numeric(14,2) NOT NULL DEFAULT 0,
  itc_reversed_sgst      numeric(14,2) NOT NULL DEFAULT 0,

  -- 4C Net ITC available (4A - 4B)
  net_itc_igst           numeric(14,2) NOT NULL DEFAULT 0,
  net_itc_cgst           numeric(14,2) NOT NULL DEFAULT 0,
  net_itc_sgst           numeric(14,2) NOT NULL DEFAULT 0,

  -- 6.1 Net tax payable (outward tax - net ITC)
  net_igst_payable       numeric(14,2) NOT NULL DEFAULT 0,
  net_cgst_payable       numeric(14,2) NOT NULL DEFAULT 0,
  net_sgst_payable       numeric(14,2) NOT NULL DEFAULT 0,

  -- Manual adjustments (user can override auto-computed values)
  manual_adjustments     jsonb,

  -- Filing
  filed_date             date,
  filed_reference        text        NOT NULL DEFAULT '',
  notes                  text        NOT NULL DEFAULT '',

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gstr3b_status_check CHECK (status IN ('draft', 'saved', 'filed')),
  CONSTRAINT gstr3b_period_unique UNIQUE (organization_id, financial_year, month)
);

CREATE INDEX IF NOT EXISTS idx_gstr3b_org_period ON gstr3b_returns (organization_id, financial_year, month);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gstr3b_updated_at' AND tgrelid = 'gstr3b_returns'::regclass) THEN
    CREATE TRIGGER trg_gstr3b_updated_at
      BEFORE UPDATE ON gstr3b_returns FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE gstr2b_imports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gstr2b_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gstr3b_returns  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_access_gstr2b_imports"
ON gstr2b_imports FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "org_members_access_gstr2b_records"
ON gstr2b_records FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "org_members_access_gstr3b_returns"
ON gstr3b_returns FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));
