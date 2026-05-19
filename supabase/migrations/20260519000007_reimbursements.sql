-- =============================================================================
-- Reimbursements Module — Phase B
-- Migration: 20260519000007_reimbursements
--
-- Tracks out-of-pocket expenses paid by partners / employees from personal
-- accounts on behalf of the company. Company owes this money back.
-- Status flow: pending → approved → reimbursed
-- =============================================================================

CREATE TABLE IF NOT EXISTS reimbursements (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Who paid and what for
  paid_by           text           NOT NULL,            -- person's name (partner / employee)
  date              date           NOT NULL,
  description       text           NOT NULL,
  category          text           NOT NULL DEFAULT 'other',

  -- Amounts
  amount            numeric(14,2)  NOT NULL DEFAULT 0,  -- total they paid (incl. GST)
  gst_amount        numeric(14,2)  NOT NULL DEFAULT 0,  -- GST portion shown on bill

  -- ITC
  itc_eligible      boolean        NOT NULL DEFAULT false,  -- false for meals/entertainment

  -- Audit
  receipt_reference text           NOT NULL DEFAULT '',  -- bill/receipt number
  notes             text           NOT NULL DEFAULT '',

  -- Status lifecycle
  status            text           NOT NULL DEFAULT 'pending',

  -- Reimbursement payment details (filled when status → reimbursed)
  reimbursed_date   date,
  reimbursed_amount numeric(14,2),                       -- may differ from amount (e.g. partial)
  payment_reference text           NOT NULL DEFAULT '',  -- bank transfer UTR / ref

  created_at        timestamptz    NOT NULL DEFAULT now(),
  updated_at        timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT reimbursements_status_check CHECK (
    status IN ('pending', 'approved', 'reimbursed', 'rejected')
  ),
  CONSTRAINT reimbursements_category_check CHECK (
    category IN (
      'travel', 'accommodation', 'meals', 'office_supplies',
      'client_entertainment', 'software', 'equipment',
      'telecom', 'medical', 'other'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_reimb_org_date   ON reimbursements (organization_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_reimb_org_status ON reimbursements (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_reimb_org_paid   ON reimbursements (organization_id, paid_by);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reimbursements_updated_at' AND tgrelid = 'reimbursements'::regclass) THEN
    CREATE TRIGGER trg_reimbursements_updated_at
      BEFORE UPDATE ON reimbursements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

ALTER TABLE reimbursements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_access_reimbursements"
ON reimbursements FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));
