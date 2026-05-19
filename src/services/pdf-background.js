import { getSupabaseClient, getDefaultOrgId } from '../lib/supabase.js';
import { getInvoiceDetail } from '../repositories/supabase/invoice-repository.js';
import { resolveInvoiceClient, buildInvoiceDocumentFromSnapshot } from './invoice-workflow.js';
import { renderInvoicePdfBuffer } from './pdf.js';
import { uploadInvoicePdf } from './pdf-storage.js';

const MAX_ATTEMPTS = Number(process.env.PDF_WORKER_MAX_ATTEMPTS || '3');

export async function processInvoicePdfJob(invoiceId, organizationId) {
  const supabase = getSupabaseClient();

  const invoiceRecord = await getInvoiceDetail(invoiceId);

  let clientRecord = null;
  try {
    clientRecord = await resolveInvoiceClient(invoiceRecord);
  } catch {
    // Address lines will be empty — PDF still renders
  }

  const invoiceDoc = buildInvoiceDocumentFromSnapshot(invoiceRecord, clientRecord);
  const pdfBuffer = await renderInvoicePdfBuffer(invoiceDoc);

  const storagePath = await uploadInvoicePdf(
    organizationId || invoiceRecord.organizationId || getDefaultOrgId(),
    invoiceId,
    pdfBuffer
  );

  const { error } = await supabase
    .from('invoices')
    .update({
      pdf_storage_path: storagePath,
      pdf_generated_at: new Date().toISOString()
    })
    .eq('id', invoiceId);

  if (error) throw new Error(`Failed to update invoice PDF path: ${error.message}`);
  return storagePath;
}

export function scheduleInvoicePdfGeneration(invoiceId, organizationId) {
  setImmediate(async () => {
    const supabase = getSupabaseClient();

    try {
      const { data: job } = await supabase
        .from('pdf_generation_jobs')
        .select('id, attempts')
        .eq('invoice_id', invoiceId)
        .maybeSingle();

      if (!job || job.attempts >= MAX_ATTEMPTS) return;

      await supabase
        .from('pdf_generation_jobs')
        .update({ status: 'processing', attempts: (job.attempts || 0) + 1 })
        .eq('id', job.id)
        .eq('status', 'pending');

      await processInvoicePdfJob(invoiceId, organizationId);

      await supabase
        .from('pdf_generation_jobs')
        .update({ status: 'completed', last_error: null, completed_at: new Date().toISOString() })
        .eq('id', job.id);

    } catch (error) {
      console.error(`[PDF Background] Job failed for invoice ${invoiceId}:`, error.message);

      await supabase
        .from('pdf_generation_jobs')
        .update({ status: 'failed', last_error: error.message })
        .eq('invoice_id', invoiceId)
        .catch(() => {});
    }
  });
}
