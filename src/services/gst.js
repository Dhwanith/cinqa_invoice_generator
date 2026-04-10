function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function calculateTaxBreakdown({ amount, clientStateCode, companyStateCode }) {
  const taxableValue = roundCurrency(amount);
  const isSameState = Number(clientStateCode) === Number(companyStateCode);

  if (isSameState) {
    const cgst = roundCurrency(taxableValue * 0.09);
    const sgst = roundCurrency(taxableValue * 0.09);
    return {
      gstType: 'CGST/SGST',
      taxableValue,
      cgst,
      sgst,
      igst: 0,
      total: roundCurrency(taxableValue + cgst + sgst)
    };
  }

  const igst = roundCurrency(taxableValue * 0.18);
  return {
    gstType: 'IGST',
    taxableValue,
    cgst: 0,
    sgst: 0,
    igst,
    total: roundCurrency(taxableValue + igst)
  };
}

export function summarizeInvoiceTaxes(lineItems) {
  return lineItems.reduce(
    (summary, lineItem) => ({
      taxableValue: roundCurrency(summary.taxableValue + lineItem.taxableValue),
      cgst: roundCurrency(summary.cgst + lineItem.cgst),
      sgst: roundCurrency(summary.sgst + lineItem.sgst),
      igst: roundCurrency(summary.igst + lineItem.igst),
      total: roundCurrency(summary.total + lineItem.total)
    }),
    { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
  );
}