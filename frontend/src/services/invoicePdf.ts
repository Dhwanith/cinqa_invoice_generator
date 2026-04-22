import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Invoice } from "@/types/invoice";
import { formatCurrency, formatDate } from "@/services/api";

const BRAND_COLOR: [number, number, number] = [163, 82, 50]; // terracotta
const DARK: [number, number, number] = [40, 30, 22];
const MUTED: [number, number, number] = [120, 100, 85];
const LIGHT_BG: [number, number, number] = [248, 244, 237];

function extractGoogleDriveFileId(invoice: Invoice): string | null {
  if (invoice.googleDriveFileId) {
    return invoice.googleDriveFileId;
  }

  if (!invoice.googleDriveUrl) {
    return null;
  }

  const slashMatch = invoice.googleDriveUrl.match(/\/d\/([^/]+)/);
  if (slashMatch?.[1]) {
    return slashMatch[1];
  }

  const queryMatch = invoice.googleDriveUrl.match(/[?&]id=([^&]+)/);
  return queryMatch?.[1] ?? null;
}

export function getActualInvoicePdfPreviewUrl(invoice: Invoice): string | null {
  const fileId = extractGoogleDriveFileId(invoice);
  if (fileId) {
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }

  return invoice.googleDriveUrl || null;
}

export function getActualInvoicePdfDownloadUrl(invoice: Invoice): string | null {
  const fileId = extractGoogleDriveFileId(invoice);
  if (fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  return invoice.googleDriveUrl || null;
}

export function generateInvoicePdf(invoice: Invoice): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = margin;

  // ── Header band ──
  doc.setFillColor(...BRAND_COLOR);
  doc.rect(0, 0, pw, 38, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("CINQA", margin, 18);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.invoiceType === "proforma" ? "Proforma Invoice" : "Tax Invoice", margin, 26);

  // Invoice number right-aligned
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(invoice.invoiceNo, pw - margin, 18, { align: "right" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`${invoice.invoiceType === "proforma" ? "Issue Date" : "Invoice Date"}: ${formatDate(invoice.invoiceDate)}`, pw - margin, 25, { align: "right" });
  if (invoice.includeDueDate !== false) {
    doc.text(`Due Date: ${formatDate(invoice.dueDate)}`, pw - margin, 30, { align: "right" });
  }

  y = 48;

  // ── Bill To / Supply Info ──
  doc.setTextColor(...DARK);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO", margin, y);
  doc.text("SUPPLY DETAILS", pw / 2 + 10, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(invoice.clientName, margin, y);
  y += 5;

  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`GSTIN: ${invoice.gstin}`, margin, y);
  doc.text(`${invoice.state} (${invoice.stateCode})`, margin, y + 4);

  // Supply column
  const sx = pw / 2 + 10;
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    invoice.invoiceType === "proforma"
      ? `Invoice Type: Proforma Invoice`
      : `Place of Supply: ${invoice.placeOfSupply || `${invoice.state} (${invoice.stateCode})`}`,
    sx,
    y
  );
  let supplyOffset = 4;
  if (invoice.invoiceType !== "proforma" && invoice.purchaseOrder?.number) {
    const purchaseOrderDate = invoice.purchaseOrder.date ? formatDate(invoice.purchaseOrder.date) : "-";
    doc.text(`PO Ref: ${invoice.purchaseOrder.number}; Dated: ${purchaseOrderDate}`, sx, y + supplyOffset);
    supplyOffset += 4;
  }

  doc.text(invoice.invoiceType === "proforma" ? `SAC: ${invoice.sac || "-"}` : `GST Type: ${invoice.gstType}`, sx, y + supplyOffset);
  doc.text(invoice.invoiceType === "proforma" ? "Taxes: Not applicable" : `Reverse Charge: ${invoice.reverseCharge}`, sx, y + supplyOffset + 4);
  if (invoice.invoiceType !== "proforma") {
    doc.text(`SAC: ${invoice.sac}`, sx, y + supplyOffset + 8);
  }

  y += 22 + (supplyOffset - 4);

  // ── Line Items Table ──
  const lineItems = invoice.lineItems || [];
  const hasLineItems = lineItems.length > 0;

  if (hasLineItems) {
    const isProforma = invoice.invoiceType === "proforma";
    const isIGST = invoice.gstType === "IGST";
    const hasQuantity = Boolean(invoice.showQuantity);
    const columnStyles: Record<number, { halign?: "left" | "center" | "right"; cellWidth?: number }> = {
      0: { cellWidth: 10, halign: "center" },
    };

    if (isProforma) {
      if (hasQuantity) {
        columnStyles[3] = { halign: "right" };
        columnStyles[4] = { halign: "right" };
        columnStyles[5] = { halign: "right" };
      } else {
        columnStyles[3] = { halign: "right" };
      }
    } else if (isIGST) {
      if (hasQuantity) {
        columnStyles[3] = { halign: "right" };
        columnStyles[4] = { halign: "right" };
        columnStyles[5] = { halign: "right" };
        columnStyles[6] = { halign: "right" };
        columnStyles[7] = { halign: "right" };
      } else {
        columnStyles[3] = { halign: "right" };
        columnStyles[4] = { halign: "right" };
        columnStyles[5] = { halign: "right" };
        columnStyles[6] = { halign: "right" };
      }
    } else if (hasQuantity) {
      columnStyles[3] = { halign: "right" };
      columnStyles[4] = { halign: "right" };
      columnStyles[5] = { halign: "right" };
      columnStyles[6] = { halign: "right" };
      columnStyles[7] = { halign: "right" };
      columnStyles[8] = { halign: "right" };
    } else {
      columnStyles[3] = { halign: "right" };
      columnStyles[4] = { halign: "right" };
      columnStyles[5] = { halign: "right" };
      columnStyles[6] = { halign: "right" };
      columnStyles[7] = { halign: "right" };
    }

    const head = isProforma
      ? [["#", "Description", "SAC", ...(hasQuantity ? ["Qty", "Unit Price"] : []), "Amount"]]
      : isIGST
      ? [["#", "Description", "SAC", ...(hasQuantity ? ["Qty", "Unit Price"] : ["Price"]), "Taxable Value", "IGST (18%)", "Total"]]
      : [["#", "Description", "SAC", ...(hasQuantity ? ["Qty", "Unit Price"] : ["Price"]), "Taxable Value", "CGST (9%)", "SGST (9%)", "Total"]];

    const body = lineItems.map((li, i) =>
      isProforma
        ? [
            String(i + 1),
            li.description,
            li.sac,
            ...(hasQuantity ? [String(li.quantity ?? 1), formatCurrency(li.unitPrice ?? li.amount)] : []),
            formatCurrency(li.amount),
          ]
        : isIGST
        ? [
            String(i + 1),
            li.description,
            li.sac,
            ...(hasQuantity ? [String(li.quantity ?? 1), formatCurrency(li.unitPrice ?? li.amount)] : [formatCurrency(li.amount)]),
            formatCurrency(li.amount),
            formatCurrency(li.igst),
            formatCurrency(li.total),
          ]
        : [
            String(i + 1),
            li.description,
            li.sac,
            ...(hasQuantity ? [String(li.quantity ?? 1), formatCurrency(li.unitPrice ?? li.amount)] : [formatCurrency(li.amount)]),
            formatCurrency(li.amount),
            formatCurrency(li.cgst),
            formatCurrency(li.sgst),
            formatCurrency(li.total),
          ]
    );

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head,
      body,
      styles: { fontSize: 8, cellPadding: 3, textColor: DARK, lineColor: [220, 210, 200], lineWidth: 0.2 },
      headStyles: { fillColor: LIGHT_BG, textColor: BRAND_COLOR, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [252, 249, 245] },
      columnStyles,
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  } else {
    // Single-line summary
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Description", "SAC", "Amount"]],
      body: [["Professional Services", invoice.sac, formatCurrency(invoice.amount)]],
      styles: { fontSize: 8, cellPadding: 3, textColor: DARK },
      headStyles: { fillColor: LIGHT_BG, textColor: BRAND_COLOR, fontStyle: "bold", fontSize: 7 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Totals Box ──
  const totalsX = pw - margin - 72;
  const boxW = 72;

  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(totalsX, y, boxW, invoice.invoiceType === "proforma" ? 20 : invoice.gstType === "IGST" ? 32 : 38, 2, 2, "F");

  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  let ty = y + 6;

  const addRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...(bold ? DARK : MUTED));
    doc.setFontSize(bold ? 9 : 7);
    doc.text(label, totalsX + 4, ty);
    doc.text(value, totalsX + boxW - 4, ty, { align: "right" });
    ty += bold ? 7 : 5;
  };

  addRow(invoice.invoiceType === "proforma" ? "Amount" : "Taxable Value", formatCurrency(invoice.amount));
  if (invoice.invoiceType !== "proforma") {
    if (invoice.gstType === "IGST") {
      addRow("IGST (18%)", formatCurrency(invoice.igst));
    } else {
      addRow("CGST (9%)", formatCurrency(invoice.cgst));
      addRow("SGST (9%)", formatCurrency(invoice.sgst));
    }
    ty += 2;
  }
  addRow("Total", formatCurrency(invoice.total), true);

  y = ty + 6;

  // ── Amount in words ──
  if (invoice.totalInWords) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...MUTED);
    doc.text(`Amount in words: ${invoice.totalInWords}`, margin, y);
    y += 8;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text("Terms & Conditions:", margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  const terms =
    invoice.invoiceType === "proforma"
      ? [
          "1. Proforma Invoice for approval only (not a tax invoice).",
          "2. Prices are exclusive of GST.",
          "3. Applicable taxes will be added in the final invoice.",
        ]
      : [
          "1. Check the invoice amount and confirm.",
          "2. Payment should be made to the mentioned account only.",
          ...(invoice.includeDueDate === false ? [] : ["3. Payment Terms: " + invoice.paymentTermsLabel + " from invoice date."]),
        ];

  for (const term of terms) {
    const wrapped = doc.splitTextToSize(term, pw - margin * 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 4;
  }
  y += 2;

  // ── Footer ──
  const footerY = doc.internal.pageSize.getHeight() - 16;
  doc.setDrawColor(...BRAND_COLOR);
  doc.setLineWidth(0.4);
  doc.line(margin, footerY, pw - margin, footerY);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text("Cinqa · AI-Powered Invoice Management", margin, footerY + 5);
  doc.text("This is a computer-generated invoice.", pw - margin, footerY + 5, { align: "right" });

  return doc;
}

export function downloadInvoicePdf(invoice: Invoice) {
  const actualDownloadUrl = getActualInvoicePdfDownloadUrl(invoice);
  if (actualDownloadUrl) {
    const link = document.createElement("a");
    link.href = actualDownloadUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
    return;
  }

  const doc = generateInvoicePdf(invoice);
  doc.save(`${invoice.invoiceNo.replace(/\//g, "-")}.pdf`);
}

export function getInvoicePdfBlobUrl(invoice: Invoice): string {
  const doc = generateInvoicePdf(invoice);
  const blob = doc.output("blob");
  return URL.createObjectURL(blob);
}
