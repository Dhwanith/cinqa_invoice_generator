-- Add 'converted' status for proforma invoices that have been converted to tax invoices
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('generated', 'pending', 'sent', 'partially_paid', 'paid', 'cancelled', 'converted'));
