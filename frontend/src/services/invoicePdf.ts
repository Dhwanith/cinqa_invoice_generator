import type { Invoice } from "@/types/invoice";

export function getActualInvoicePdfPreviewUrl(invoice: Invoice): string {
  return `/api/invoices/${invoice.id}/pdf`;
}

export function getActualInvoicePdfDownloadUrl(invoice: Invoice): string | null {
  if (!invoice.id) return null;
  return `/api/invoices/${invoice.id}/pdf?download=1`;
}

export function downloadInvoicePdf(invoice: Invoice): void {
  const url = getActualInvoicePdfDownloadUrl(invoice);
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}
