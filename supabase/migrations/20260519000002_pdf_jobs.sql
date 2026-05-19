-- =============================================================================
-- PDF generation job queue
-- Migration: 20260519000002_pdf_jobs
--
-- Tracks background PDF generation for every invoice.
-- One row per invoice (UNIQUE on invoice_id).
-- The app server inserts 'pending' at invoice creation time.
-- The background worker claims jobs by updating status to 'processing'.
-- On success: 'completed' + invoices.pdf_storage_path is set.
-- On failure: 'failed' + last_error recorded; retried up to max_attempts.
-- =============================================================================

CREATE TABLE IF NOT EXISTS pdf_generation_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  invoice_id      uuid        NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'pending',
  attempts        integer     NOT NULL DEFAULT 0,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  CONSTRAINT pdf_jobs_invoice_key   UNIQUE (invoice_id),
  CONSTRAINT pdf_jobs_status_check  CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_pdf_jobs_status
  ON pdf_generation_jobs (status, created_at)
  WHERE status IN ('pending', 'failed');

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_pdf_jobs_updated_at' AND tgrelid = 'pdf_generation_jobs'::regclass
  ) THEN
    CREATE TRIGGER trg_pdf_jobs_updated_at
      BEFORE UPDATE ON pdf_generation_jobs
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

ALTER TABLE pdf_generation_jobs ENABLE ROW LEVEL SECURITY;
