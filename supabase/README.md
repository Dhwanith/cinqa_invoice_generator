# Supabase Setup

## 1. Create project

Create a new project at https://supabase.com. Note:
- **Project URL** → `SUPABASE_URL`
- **service_role key** (Settings → API) → `SUPABASE_SERVICE_ROLE_KEY`
- **anon key** → `SUPABASE_ANON_KEY` (used by frontend in Phase 9)

## 2. Run the migration

Open **SQL Editor** in the Supabase dashboard and run the contents of:

```
supabase/migrations/20260519000001_initial_schema.sql
```

Or via the Supabase CLI:

```bash
supabase db push
```

## 3. Seed development data (optional)

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
```

Or paste `supabase/seed.sql` into the SQL Editor.

## 4. Create the PDF storage bucket

In the Supabase dashboard → **Storage** → **New bucket**:

| Setting | Value |
|---|---|
| Name | `invoices` |
| Public | **No** (private) |
| File size limit | 10 MB |
| Allowed MIME types | `application/pdf` |

Path convention: `{organization_id}/{invoice_id}.pdf`

**Or via Supabase CLI:**
```bash
supabase storage create invoices --no-public
```

## 5. Add env vars to `.env`

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...

# Organization ID from the seed (single-org setup, phases 4-8)
SUPABASE_DEFAULT_ORG_ID=00000000-0000-0000-0000-000000000001
```

## Schema overview

```
organizations
  └── clients               (organization_id FK)
  └── invoice_sequences     (organization_id FK, atomic sequence per FY+type)
  └── invoices              (organization_id FK, client_id FK)
        └── invoice_line_items  (invoice_id FK — no more string join on invoice_no)
```

## Key functions

| Function | Purpose |
|---|---|
| `financial_year_label(date)` | `'2026-04-15'` → `'26-27'` |
| `build_invoice_number(date, seq, type)` | `(date, 3, 'tax')` → `'CTS/26-27/INV003'` |
| `next_invoice_sequence(org_id, fy, type)` | Atomic increment, no race condition |

## Atomic invoice creation (Phase 5+)

```sql
WITH seq AS (
  SELECT next_invoice_sequence(
    '00000000-0000-0000-0000-000000000001'::uuid,
    financial_year_label('2026-04-15'::date),
    'tax'
  ) AS n
)
INSERT INTO invoices (organization_id, invoice_no, invoice_type, ...)
SELECT
  '00000000-0000-0000-0000-000000000001',
  build_invoice_number('2026-04-15'::date, seq.n, 'tax'),
  'tax',
  ...
FROM seq;
```

## RLS

RLS is enabled on all tables. The app server uses the **service_role** key, which bypasses RLS automatically. Per-user policies will be added in **Phase 9** (Auth + multi-tenancy).
