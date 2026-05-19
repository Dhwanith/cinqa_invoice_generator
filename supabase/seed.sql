-- =============================================================================
-- Development seed data
-- Run AFTER the migration: psql -f supabase/seed.sql
-- Safe to re-run (all INSERTs use ON CONFLICT DO NOTHING)
-- =============================================================================

-- Default organization (single-org setup for phases 4-8)
INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Cinqa Tech Solutions LLP', 'cinqa')
ON CONFLICT (slug) DO NOTHING;

-- Sample client (mirrors airtable/clients.csv)
INSERT INTO clients (
  id,
  organization_id,
  name,
  gstin,
  state,
  state_code,
  address_line_1,
  address_line_2,
  default_sac,
  default_payment_terms_days,
  active
)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'AdKrity Digital Solutions Private Limited',
  '24AAVCA3793L1ZY',
  'Gujarat',
  24,
  '28 29, C K Park, Adajan, Honey Park Road,',
  'Rander, Surat - 395009, GJ(24)',
  '998314',
  10,
  true
)
ON CONFLICT (organization_id, gstin) DO NOTHING;
