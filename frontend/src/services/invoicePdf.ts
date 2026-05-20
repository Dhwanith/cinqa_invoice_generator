import type { Invoice } from "@/types/invoice";
import { getAuthHeader } from "@/services/api";

export async function fetchInvoicePdfUrl(
  invoice: Invoice
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
  return { url: data.url as string, filename: data.filename as string };
}

export async function downloadInvoicePdf(invoice: Invoice): Promise<void> {
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
