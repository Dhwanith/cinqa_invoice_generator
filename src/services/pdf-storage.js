import { getSupabaseClient } from '../lib/supabase.js';

const BUCKET = 'invoices';
const SIGNED_URL_TTL_SECONDS = Number(process.env.PDF_SIGNED_URL_TTL || '3600');

export function buildStoragePath(organizationId, invoiceId) {
  return `${organizationId}/${invoiceId}.pdf`;
}

export async function uploadInvoicePdf(organizationId, invoiceId, pdfBuffer) {
  const supabase = getSupabaseClient();
  const storagePath = buildStoragePath(organizationId, invoiceId);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return storagePath;
}

export async function getSignedPdfUrl(storagePath, ttlSeconds = SIGNED_URL_TTL_SECONDS) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, ttlSeconds);

  if (error) throw new Error(`Failed to create signed URL: ${error.message}`);
  return data.signedUrl;
}

export async function deleteStoredPdf(storagePath) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) throw new Error(`Failed to delete stored PDF: ${error.message}`);
}
