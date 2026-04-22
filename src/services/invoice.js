import { companyProfile } from '../config/company.js';
import { amountToWords } from './amount-in-words.js';
import { addDays, formatDisplayDate } from './financial-year.js';
import { calculateTaxBreakdown, summarizeInvoiceTaxes } from './gst.js';
import { buildInvoiceNumber } from './invoice-number.js';
import { normalizeInvoiceRequest } from './validation.js';

export function buildInvoiceDocument(payload, overrides = {}) {
  const request = normalizeInvoiceRequest(payload);
  const company = overrides.company || companyProfile;
  const paymentTermsDays = Number(
    overrides.paymentTermsDays || payload.paymentTermsDays || request.client.defaultPaymentTermsDays || company.paymentTermsDays
  );
  const invoiceDate = new Date(request.invoiceDate);
  const dueDate = request.includeDueDate ? addDays(invoiceDate, paymentTermsDays) : null;
  const invoiceNo = buildInvoiceNumber({ date: invoiceDate, sequence: request.sequence, invoiceType: request.invoiceType });
  const sourceProformaDate = request.sourceProforma ? new Date(request.sourceProforma.invoiceDate) : null;
  const purchaseOrderDate = request.purchaseOrder ? new Date(request.purchaseOrder.date) : null;

  const lineItems = request.lineItems.map((lineItem) => {
    if (request.invoiceType === 'proforma') {
      return {
        ...lineItem,
        price: request.showQuantity ? lineItem.unitPrice : lineItem.amount,
        taxableValue: lineItem.amount,
        gstType: 'NONE',
        cgst: 0,
        sgst: 0,
        igst: 0,
        total: lineItem.amount
      };
    }

    const taxes = calculateTaxBreakdown({
      amount: lineItem.amount,
      clientStateCode: request.client.stateCode,
      companyStateCode: company.stateCode
    });

    return {
      ...lineItem,
      price: request.showQuantity ? lineItem.unitPrice : taxes.taxableValue,
      ...taxes
    };
  });

  const totals = summarizeInvoiceTaxes(lineItems);
  const uniqueSacs = [...new Set(lineItems.map((lineItem) => lineItem.sac))];

  return {
    idempotencyKey: request.idempotencyKey,
    invoiceNo,
    invoiceType: request.invoiceType,
    showQuantity: request.showQuantity,
    includeDueDate: request.includeDueDate,
    title: request.invoiceType === 'proforma' ? 'Proforma Invoice' : 'Tax Invoice',
    invoiceDate: request.invoiceDate,
    invoiceDateDisplay: formatDisplayDate(invoiceDate),
    dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : '',
    dueDateDisplay: dueDate ? formatDisplayDate(dueDate) : '',
    sourceProforma: request.sourceProforma
      ? {
          ...request.sourceProforma,
          invoiceDateDisplay: formatDisplayDate(sourceProformaDate)
        }
      : null,
    purchaseOrder: request.purchaseOrder
      ? {
          ...request.purchaseOrder,
          dateDisplay: formatDisplayDate(purchaseOrderDate)
        }
      : null,
    placeOfSupply: `${request.client.state} (${String(request.client.stateCode).padStart(2, '0')})`,
    gstType: request.invoiceType === 'proforma' ? 'NONE' : lineItems[0].gstType,
    client: request.client,
    company,
    lineItems,
    taxableValue: totals.taxableValue,
    amount: totals.taxableValue,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    total: totals.total,
    totalInWords: amountToWords(totals.total),
    sac: uniqueSacs.length === 1 ? uniqueSacs[0] : uniqueSacs.filter(Boolean).join(', '),
    reverseCharge: 'No',
    paymentTermsLabel: request.includeDueDate ? `Net ${paymentTermsDays} days` : ''
  };
}