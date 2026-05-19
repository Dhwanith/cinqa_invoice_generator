-- =============================================================================
-- Auth user seed — run AFTER creating a user in the Supabase Auth dashboard
--
-- Steps:
--  1. Supabase dashboard → Authentication → Users → Add user
--     Email:    tarunchelumalla@cinqa.space   (or any email you prefer)
--     Password: set a strong password
--     ✓ Auto-confirm email
--  2. Copy the user UUID from the dashboard (looks like: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
--  3. Replace YOUR_AUTH_USER_UUID below with that UUID
--  4. Run this SQL in the Supabase SQL Editor
-- =============================================================================

INSERT INTO organization_members (organization_id, user_id, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',   -- Cinqa org (from seed.sql)
  'YOUR_AUTH_USER_UUID',                     -- replace with actual UUID from Auth dashboard
  'owner'
)
ON CONFLICT (organization_id, user_id) DO NOTHING;
