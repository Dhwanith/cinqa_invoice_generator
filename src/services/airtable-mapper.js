export function mapInvoiceToAirtableFields(invoice) {
  return {
    'Invoice No': invoice.invoiceNo,
    'Idempotency Key': invoice.idempotencyKey,
    'Invoice Type': invoice.invoiceType,
    'Show Quantity': Boolean(invoice.showQuantity),
    'Include Due Date': invoice.includeDueDate !== false,
    'Invoice Date': invoice.invoiceDate,
    ...(invoice.includeDueDate !== false && invoice.dueDate ? { 'Due Date': invoice.dueDate } : {}),
    'Client Name': invoice.client.name,
    GSTIN: invoice.client.gstin,
    State: invoice.client.state,
    'State Code': invoice.client.stateCode,
    'Place of Supply': invoice.placeOfSupply,
    ...(invoice.invoiceType === 'proforma' ? {} : { 'GST Type': invoice.gstType }),
    ...(invoice.sourceProforma
      ? {
          'Source Proforma Invoice No': invoice.sourceProforma.invoiceNo,
          'Source Proforma Invoice Date': invoice.sourceProforma.invoiceDate
        }
      : {}),
    ...(invoice.purchaseOrder
      ? {
          'Purchase Order No': invoice.purchaseOrder.number,
          'Purchase Order Date': invoice.purchaseOrder.date
        }
      : {}),
    Amount: invoice.amount,
    CGST: invoice.cgst,
    SGST: invoice.sgst,
    IGST: invoice.igst,
    Total: invoice.total,
    SAC: invoice.sac,
    'Reverse Charge': invoice.reverseCharge,
    Status: 'generated',
    'Total In Words': invoice.totalInWords
  };
}

export function mapLineItemsToAirtableFields(invoice, invoiceRecordId = null) {
  return invoice.lineItems.map((lineItem) => ({
    Invoice: invoiceRecordId ? [invoiceRecordId] : [],
    'Line No': lineItem.lineNumber,
    Description: lineItem.description,
    SAC: lineItem.sac,
    Quantity: lineItem.quantity,
    'Unit Price': lineItem.unitPrice,
    Amount: lineItem.amount,
    'Taxable Value': lineItem.taxableValue,
    CGST: lineItem.cgst,
    SGST: lineItem.sgst,
    IGST: lineItem.igst,
    Total: lineItem.total
  }));
}

export function buildSequenceUpdate({ financialYear, sequence, invoiceNo, invoiceType }) {
  return {
    'Financial Year': financialYear,
    Type: invoiceType || 'tax',
    'Last Sequence': sequence,
    'Last Invoice No': invoiceNo
  };
}