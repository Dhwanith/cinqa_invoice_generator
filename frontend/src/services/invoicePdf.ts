import type { Invoice } from "@/types/invoice";
import { getAuthHeader } from "@/services/api";

export interface MinimalInvoiceRef {
  id: string;
  clientName?: string;
  invoiceNo?: string;
}

export async function fetchInvoicePdfUrl(
  invoice: MinimalInvoiceRef
): Promise<{ url: string; filename: string }> {
  const authHeader = await getAuthHeader();
  const res = await fetch(`/api/invoices/${invoice.id}/pdf-url`, {
    headers: authHeader ? { Authorization: authHeader } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || "Failed to load PDF");
  }
  const data = await res.json();
  const fallbackClient = (invoice.clientName || "Client").trim().replace(/[/\\?%*:|"<>]/g, "_");
  const fallbackNo = (invoice.invoiceNo || "Invoice").trim().replace(/[/\\?%*:|"<>]/g, "-");
  const filename = data.filename || `${fallbackClient}_${fallbackNo}.pdf`;
  return { url: data.url as string, filename };
}

export async function downloadInvoicePdf(invoice: MinimalInvoiceRef): Promise<void> {
  const { url, filename } = await fetchInvoicePdfUrl(invoice);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener noreferrer";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

