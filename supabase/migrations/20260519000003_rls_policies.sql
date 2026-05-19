-- =============================================================================
-- RLS Policies + Organization Members
-- Migration: 20260519000003_rls_policies
--
-- Adds:
--   organization_members — links Supabase Auth users to organizations
--   is_org_member()      — helper function for RLS policy expressions
--   Per-table RLS policies for authenticated users
--
-- The service_role key used by the app server bypasses RLS automatically.
-- These policies take effect when the frontend calls Supabase directly with
-- the anon key + a valid Supabase Auth JWT (Phase 9+).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Organization members
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_members (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL,    -- auth.users.id from Supabase Auth
  role            text        NOT NULL DEFAULT 'member',
  invited_by      uuid,                   -- auth.users.id of inviter
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_members_user_org_key  UNIQUE (organization_id, user_id),
  CONSTRAINT org_members_role_check    CHECK (role IN ('owner', 'member'))
);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Members can see all members in their own org
CREATE POLICY "org_members_view_own_org_members"
ON organization_members
FOR SELECT TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members AS m
    WHERE m.user_id = auth.uid()
  )
);

-- Only owners can add / remove members
CREATE POLICY "org_owners_manage_members"
ON organization_members
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM organization_members AS m
    WHERE m.organization_id = organization_members.organization_id
      AND m.user_id = auth.uid()
      AND m.role = 'owner'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members AS m
    WHERE m.organization_id = organization_members.organization_id
      AND m.user_id = auth.uid()
      AND m.role = 'owner'
  )
);

-- ---------------------------------------------------------------------------
-- 2. Helper: is_org_member(org_id) — used in all RLS USING / WITH CHECK clauses
--    SECURITY DEFINER runs as the function owner, bypassing RLS on org_members
--    so it can safely read the membership table.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_org_member(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = p_organization_id
      AND user_id          = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS policies — one per table
-- ---------------------------------------------------------------------------

-- organizations: members can read their own org
CREATE POLICY "org_members_view_own_organization"
ON organizations
FOR SELECT TO authenticated
USING (is_org_member(id));

-- clients
CREATE POLICY "org_members_access_clients"
ON clients
FOR ALL TO authenticated
USING     (is_org_member(organization_id))
WITH CHECK (is_org_member(organization_id));

-- invoices
CREATE POLICY "org_members_access_invoices"
ON invoices
FOR ALL TO authenticated
USING     (is_org_member(organization_id))
WITH CHECK (is_org_member(organization_id));

-- invoice_line_items
CREATE POLICY "org_members_access_line_items"
ON invoice_line_items
FOR ALL TO authenticated
USING     (is_org_member(organization_id))
WITH CHECK (is_org_member(organization_id));

-- invoice_sequences
CREATE POLICY "org_members_access_sequences"
ON invoice_sequences
FOR ALL TO authenticated
USING     (is_org_member(organization_id))
WITH CHECK (is_org_member(organization_id));

-- pdf_generation_jobs
CREATE POLICY "org_members_access_pdf_jobs"
ON pdf_generation_jobs
FOR ALL TO authenticated
USING     (is_org_member(organization_id))
WITH CHECK (is_org_member(organization_id));
