-- =============================================================================
-- Purchases Module — Phase A
-- Migration: 20260519000006_purchases
--
-- Tables: vendors, purchases, purchase_line_items
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Vendors (bill-from master, mirrors clients for the buy side)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vendors (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                       text        NOT NULL,
  gstin                      text,                    -- nullable: unregistered vendors have no GSTIN
  state                      text        NOT NULL DEFAULT '',
  state_code                 integer     NOT NULL DEFAULT 0,
  address_line_1             text        NOT NULL DEFAULT '',
  address_line_2             text        NOT NULL DEFAULT '',
  address_line_3             text        NOT NULL DEFAULT '',
  category                   text        NOT NULL DEFAULT 'other',
  default_payment_terms_days integer     NOT NULL DEFAULT 30,
  email                      text        NOT NULL DEFAULT '',
  phone                      text        NOT NULL DEFAULT '',
  notes                      text        NOT NULL DEFAULT '',
  active                     boolean     NOT NULL DEFAULT true,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  -- PostgreSQL UNIQUE allows multiple NULLs, so unregistered vendors won't conflict
  CONSTRAINT vendors_category_check CHECK (
    category IN ('software', 'cloud', 'office', 'equipment',
                 'professional_services', 'travel', 'marketing', 'utilities', 'other')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS vendors_org_gstin_unique
  ON vendors (organization_id, gstin)
  WHERE gstin IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendors_org_active  ON vendors (organization_id, active);
CREATE INDEX IF NOT EXISTS idx_vendors_org_name    ON vendors (organization_id, lower(name));

-- ---------------------------------------------------------------------------
-- 2. Purchases (vendor invoices received — accounts payable)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS purchases (
  id                   uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id            uuid           REFERENCES vendors(id),

  -- Snapshot (preserved even if vendor record changes)
  vendor_name          text           NOT NULL,
  vendor_gstin         text,
  vendor_state_code    integer        NOT NULL DEFAULT 0,

  -- Vendor's invoice reference
  purchase_number      text           NOT NULL DEFAULT '',   -- vendor's invoice number
  purchase_date        date           NOT NULL,
  due_date             date,

  -- Financials (summed from line items)
  amount               numeric(14,2)  NOT NULL DEFAULT 0,   -- taxable value
  cgst                 numeric(14,2)  NOT NULL DEFAULT 0,
  sgst                 numeric(14,2)  NOT NULL DEFAULT 0,
  igst                 numeric(14,2)  NOT NULL DEFAULT 0,
  total                numeric(14,2)  NOT NULL DEFAULT 0,
  gst_type             text           NOT NULL DEFAULT '',   -- CGST/SGST | IGST | NONE

  -- GST / ITC
  itc_eligible         boolean        NOT NULL DEFAULT true,
  itc_type             text           NOT NULL DEFAULT 'full',  -- full | restricted | blocked
  is_rcm               boolean        NOT NULL DEFAULT false,   -- reverse charge mechanism

  -- Status & classification
  status               text           NOT NULL DEFAULT 'booked',
  category             text           NOT NULL DEFAULT 'other',
  notes                text           NOT NULL DEFAULT '',

  -- Payment
  payment_date         date,
  payment_reference    text           NOT NULL DEFAULT '',

  created_at           timestamptz    NOT NULL DEFAULT now(),
  updated_at           timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT purchases_status_check  CHECK (status  IN ('draft', 'booked', 'paid', 'cancelled')),
  CONSTRAINT purchases_itc_check     CHECK (itc_type IN ('full', 'restricted', 'blocked')),
  CONSTRAINT purchases_category_check CHECK (
    category IN ('software', 'cloud', 'office', 'equipment',
                 'professional_services', 'travel', 'marketing',
                 'utilities', 'payroll_processing', 'bank_charges', 'other')
  )
);

CREATE INDEX IF NOT EXISTS idx_purchases_org_date    ON purchases (organization_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_org_status  ON purchases (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_purchases_org_vendor  ON purchases (organization_id, vendor_id);

-- ---------------------------------------------------------------------------
-- 3. Purchase line items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS purchase_line_items (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  purchase_id     uuid           NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  line_number     integer        NOT NULL,
  description     text           NOT NULL,
  hsn_sac         text           NOT NULL DEFAULT '',
  quantity        numeric(14,4),
  unit_price      numeric(14,2),
  amount          numeric(14,2)  NOT NULL DEFAULT 0,  -- taxable value for this line
  gst_rate        numeric(5,2)   NOT NULL DEFAULT 18, -- 0, 5, 12, 18, 28
  cgst            numeric(14,2)  NOT NULL DEFAULT 0,
  sgst            numeric(14,2)  NOT NULL DEFAULT 0,
  igst            numeric(14,2)  NOT NULL DEFAULT 0,
  total           numeric(14,2)  NOT NULL DEFAULT 0,
  created_at      timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT purchase_line_items_line_key UNIQUE (purchase_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_line_items_purchase ON purchase_line_items (purchase_id);

-- ---------------------------------------------------------------------------
-- 4. updated_at triggers
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vendors_updated_at' AND tgrelid = 'vendors'::regclass) THEN
    CREATE TRIGGER trg_vendors_updated_at
      BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_purchases_updated_at' AND tgrelid = 'purchases'::regclass) THEN
    CREATE TRIGGER trg_purchases_updated_at
      BEFORE UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE vendors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases            ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_line_items  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_access_vendors"
ON vendors FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "org_members_access_purchases"
ON purchases FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "org_members_access_purchase_line_items"
ON purchase_line_items FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));
