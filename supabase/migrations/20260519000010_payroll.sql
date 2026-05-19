-- =============================================================================
-- Payroll Module — Phase E
-- Migration: 20260519000010_payroll
--
-- Tables:
--   employees        — Employee and partner master
--   salary_structures — Monthly salary components per employee
--   payroll_runs     — Monthly payroll run (one per month)
--   payroll_entries  — Individual salary computation per employee per run
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Employees
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employees (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  employee_code    text        NOT NULL DEFAULT '',
  pan              text        NOT NULL DEFAULT '',
  employee_type    text        NOT NULL DEFAULT 'employee',
  designation      text        NOT NULL DEFAULT '',
  department       text        NOT NULL DEFAULT '',
  join_date        date,
  exit_date        date,
  bank_account     text        NOT NULL DEFAULT '',
  bank_ifsc        text        NOT NULL DEFAULT '',
  bank_name        text        NOT NULL DEFAULT '',
  pf_applicable    boolean     NOT NULL DEFAULT false,
  esi_applicable   boolean     NOT NULL DEFAULT false,
  tds_applicable   boolean     NOT NULL DEFAULT true,
  active           boolean     NOT NULL DEFAULT true,
  notes            text        NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employees_type_check CHECK (employee_type IN ('employee', 'partner', 'consultant'))
);

CREATE INDEX IF NOT EXISTS idx_employees_org_active ON employees (organization_id, active);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_employees_updated_at' AND tgrelid = 'employees'::regclass) THEN
    CREATE TRIGGER trg_employees_updated_at
      BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Salary Structures (effective-date versioned per employee)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS salary_structures (
  id                 uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id        uuid           NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  effective_from     date           NOT NULL DEFAULT CURRENT_DATE,
  basic              numeric(14,2)  NOT NULL DEFAULT 0,
  hra                numeric(14,2)  NOT NULL DEFAULT 0,
  special_allowance  numeric(14,2)  NOT NULL DEFAULT 0,
  other_allowances   numeric(14,2)  NOT NULL DEFAULT 0,
  -- total_gross = basic + hra + special_allowance + other_allowances (computed in app)
  pf_employee_rate   numeric(5,2)   NOT NULL DEFAULT 12.00,  -- % of basic
  esi_employee_rate  numeric(5,2)   NOT NULL DEFAULT 0.75,   -- % of gross (if ESI applicable)
  tds_monthly        numeric(14,2)  NOT NULL DEFAULT 0,      -- CA-provided estimated monthly TDS
  created_at         timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT salary_structure_employee_date_key UNIQUE (employee_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_salary_structures_employee ON salary_structures (employee_id, effective_from DESC);

-- ---------------------------------------------------------------------------
-- 3. Payroll Runs (one per month per organisation)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payroll_runs (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month            integer        NOT NULL,         -- 1-12
  year             integer        NOT NULL,
  period_label     text           NOT NULL,         -- 'May 2026'
  financial_year   text           NOT NULL DEFAULT '',
  working_days     integer        NOT NULL DEFAULT 26,
  status           text           NOT NULL DEFAULT 'draft',
  total_gross      numeric(14,2)  NOT NULL DEFAULT 0,
  total_deductions numeric(14,2)  NOT NULL DEFAULT 0,
  total_net        numeric(14,2)  NOT NULL DEFAULT 0,
  total_tds        numeric(14,2)  NOT NULL DEFAULT 0,
  total_pf         numeric(14,2)  NOT NULL DEFAULT 0,
  notes            text           NOT NULL DEFAULT '',
  processed_at     timestamptz,
  approved_at      timestamptz,
  paid_at          timestamptz,
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_at       timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT payroll_runs_period_key UNIQUE (organization_id, year, month),
  CONSTRAINT payroll_runs_status_check CHECK (status IN ('draft', 'processed', 'approved', 'paid'))
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_org ON payroll_runs (organization_id, year DESC, month DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payroll_runs_updated_at' AND tgrelid = 'payroll_runs'::regclass) THEN
    CREATE TRIGGER trg_payroll_runs_updated_at
      BEFORE UPDATE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Payroll Entries (one per employee per run)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payroll_entries (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id    uuid           NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  organization_id   uuid           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id       uuid           NOT NULL REFERENCES employees(id),
  -- Attendance
  working_days      integer        NOT NULL DEFAULT 26,
  present_days      integer        NOT NULL DEFAULT 26,
  lop_days          integer        NOT NULL DEFAULT 0,
  -- Earnings (pro-rated for LOP)
  basic             numeric(14,2)  NOT NULL DEFAULT 0,
  hra               numeric(14,2)  NOT NULL DEFAULT 0,
  special_allowance numeric(14,2)  NOT NULL DEFAULT 0,
  other_allowances  numeric(14,2)  NOT NULL DEFAULT 0,
  bonus             numeric(14,2)  NOT NULL DEFAULT 0,
  gross_salary      numeric(14,2)  NOT NULL DEFAULT 0,
  -- Deductions
  pf_employee       numeric(14,2)  NOT NULL DEFAULT 0,
  esi_employee      numeric(14,2)  NOT NULL DEFAULT 0,
  tds               numeric(14,2)  NOT NULL DEFAULT 0,
  professional_tax  numeric(14,2)  NOT NULL DEFAULT 0,  -- Gujarat: 0
  other_deductions  numeric(14,2)  NOT NULL DEFAULT 0,
  total_deductions  numeric(14,2)  NOT NULL DEFAULT 0,
  net_salary        numeric(14,2)  NOT NULL DEFAULT 0,
  -- Payment
  payment_status    text           NOT NULL DEFAULT 'pending',
  payment_date      date,
  payment_reference text           NOT NULL DEFAULT '',
  created_at        timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT payroll_entries_run_employee_key UNIQUE (payroll_run_id, employee_id),
  CONSTRAINT payroll_entries_status_check CHECK (payment_status IN ('pending', 'paid'))
);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_run ON payroll_entries (payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_employee ON payroll_entries (employee_id);

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE employees         ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_access_employees"
ON employees FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "org_members_access_salary_structures"
ON salary_structures FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "org_members_access_payroll_runs"
ON payroll_runs FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "org_members_access_payroll_entries"
ON payroll_entries FOR ALL TO authenticated
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));
