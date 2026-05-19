-- Fix SECURITY DEFINER warning on invoice_list view.
--
-- By default PostgreSQL views run with the permissions of the view creator
-- (Supabase postgres superuser), which bypasses RLS. SECURITY INVOKER makes
-- the view run with the querying user's permissions so RLS applies correctly.

DROP VIEW IF EXISTS invoice_list;

CREATE OR REPLACE VIEW invoice_list
WITH (security_invoker = on)
AS
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
