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
  // Same format as the server: "XYXX Pvt Ltd" + "CTS/26-27/INV015" → "XYXX_CTS_26_27_INV015.pdf"
  const fallbackClient = ((invoice.clientName || "Client").trim().split(/\s+/)[0] || "").replace(/[^A-Za-z0-9]/g, "") || "Client";
  const fallbackNo = (invoice.invoiceNo || "Invoice").trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Invoice";
  const filename = data.filename || `${fallbackClient}_${fallbackNo}.pdf`;
  return { url: data.url as string, filename };
}

export async function downloadInvoicePdf(invoice: MinimalInvoiceRef): Promise<void> {
  const { url, filename } = await fetchInvoicePdfUrl(invoice);

  // Download via a blob object URL: browsers block top-frame navigation to
  // data: URIs (the on-demand fallback right after creating an invoice), and
  // ignore the download filename on cross-origin signed URLs.
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch the invoice PDF.");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

