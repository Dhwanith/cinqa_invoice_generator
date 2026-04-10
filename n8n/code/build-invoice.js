const env = typeof $env === 'object' && $env !== null ? $env : {};

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatInvoiceSequence(sequence) {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error('Invoice sequence must be a positive integer.');
  }

  return String(sequence).padStart(3, '0');
}

function getInvoiceNumberCode(invoiceType) {
  return invoiceType === 'proforma' ? 'PI' : 'INV';
}

function buildInvoiceNumber(financialYear, sequence, invoiceType) {
  return `CTS/${financialYear}/${getInvoiceNumberCode(invoiceType)}/${formatInvoiceSequence(sequence)}`;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function formatDisplayDate(value) {
  const date = new Date(value);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function calculateTaxBreakdown(amount, clientStateCode, companyStateCode) {
  const gstRate = Number(env.DEFAULT_GST_RATE || '0.18');
  const splitRate = gstRate / 2;
  const taxableValue = roundCurrency(amount);
  const isSameState = Number(clientStateCode) === Number(companyStateCode);

  if (isSameState) {
    const cgst = roundCurrency(taxableValue * splitRate);
    const sgst = roundCurrency(taxableValue * splitRate);

    return {
      gstType: 'CGST/SGST',
      taxableValue,
      cgst,
      sgst,
      igst: 0,
      total: roundCurrency(taxableValue + cgst + sgst)
    };
  }

  const igst = roundCurrency(taxableValue * gstRate);
  return {
    gstType: 'IGST',
    taxableValue,
    cgst: 0,
    sgst: 0,
    igst,
    total: roundCurrency(taxableValue + igst)
  };
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const TEENS = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitsToWords(number) {
  if (number < 10) return ONES[number];
  if (number < 20) return TEENS[number - 10];
  const tens = Math.floor(number / 10);
  const remainder = number % 10;
  return `${TENS[tens]}${remainder ? `-${ONES[remainder]}` : ''}`.trim();
}

function threeDigitsToWords(number) {
  const hundreds = Math.floor(number / 100);
  const remainder = number % 100;
  const parts = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (remainder) parts.push(twoDigitsToWords(remainder));
  return parts.join(' ');
}

function integerToIndianWords(number) {
  if (number === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(number / 10000000);
  const lakh = Math.floor((number % 10000000) / 100000);
  const thousand = Math.floor((number % 100000) / 1000);
  const remainder = number % 1000;
  if (crore) parts.push(`${integerToIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitsToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitsToWords(thousand)} Thousand`);
  if (remainder) parts.push(threeDigitsToWords(remainder));
  return parts.join(' ').trim();
}

function amountToWords(amount) {
  const rounded = roundCurrency(amount);
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);
  const rupeeWords = `${integerToIndianWords(rupees)} Rupees`;
  return paise ? `${rupeeWords} and ${integerToIndianWords(paise)} Paise Only` : `${rupeeWords} Only`;
}

function normalizeSacValue(value) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return value;
}

const validated = $items('Hydrate Client Defaults', 0, 0)[0].json;
const request = validated.request;
const metadata = validated.metadata;
const clientLinkField = env.AIRTABLE_FIELD_CLIENT_LINK || null;
const sequenceLookup = $json.records ?? [];
const sequenceRecord = sequenceLookup[0] ?? null;
const lastSequence = Number(sequenceRecord?.fields?.['Last Sequence'] || 0);
const sequence = lastSequence + 1;
const invoiceNo = buildInvoiceNumber(metadata.financialYear, sequence, request.invoiceType);
const invoiceDate = new Date(request.invoiceDate);
const dueDate = request.includeDueDate ? addDays(invoiceDate, metadata.paymentTermsDays) : null;
const generatedStatusLabel = env.AIRTABLE_INVOICE_STATUS_GENERATED || 'generated';

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

  const taxes = calculateTaxBreakdown(lineItem.amount, request.client.stateCode, metadata.companyStateCode);
  return {
    ...lineItem,
    price: request.showQuantity ? lineItem.unitPrice : taxes.taxableValue,
    ...taxes
  };
});

const totals = lineItems.reduce(
  (summary, lineItem) => ({
    amount: roundCurrency(summary.amount + lineItem.taxableValue),
    cgst: roundCurrency(summary.cgst + lineItem.cgst),
    sgst: roundCurrency(summary.sgst + lineItem.sgst),
    igst: roundCurrency(summary.igst + lineItem.igst),
    total: roundCurrency(summary.total + lineItem.total)
  }),
  { amount: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
);

const uniqueSacs = [...new Set(lineItems.map((lineItem) => normalizeSacValue(lineItem.sac)))];
const invoiceSacValue = uniqueSacs.length === 1 ? uniqueSacs[0] : null;
const company = {
  name: env.COMPANY_NAME || 'Cinqa Tech Solutions LLP',
  gstin: env.COMPANY_GSTIN || env.COMPANY_GST || '24AAWFC2925N1ZX',
  pan: env.COMPANY_PAN || 'AAWFC2925N',
  tan: env.COMPANY_TAN || 'SRTC05319G',
  state: env.COMPANY_STATE || 'Gujarat',
  stateCode: Number(env.COMPANY_STATE_CODE || '24'),
  addressLines: [env.COMPANY_ADDRESS_LINE_1 || '47/107, Soham Park, Saraswat Nagar', env.COMPANY_ADDRESS_LINE_2 || 'Piplod, Surat - 395007, GJ(24)'].filter(Boolean),
  email: env.COMPANY_EMAIL || 'tarunchelumalla@cinqa.space',
  website: env.COMPANY_WEBSITE || 'www.cinqa.space',
  bankAccountName: env.BANK_ACCOUNT_NAME || 'CINQA TECH SOLUTIONS LLP',
  bankName: env.BANK_NAME || 'Axis Bank',
  bankAccountNumber: env.BANK_ACCOUNT_NUMBER || '926020012433774',
  bankBranchName: env.BANK_BRANCH_NAME || 'Parle Point, Surat',
  bankIfsc: env.BANK_IFSC || 'UTIB0005112',
  authorizedSignatory: env.AUTHORIZED_SIGNATORY || 'Authorized Signatory'
};
const paymentTermsLabel = `Net ${metadata.paymentTermsDays} days`;

const placeOfSupply = `${request.client.state} (${String(request.client.stateCode).padStart(2, '0')})`;
const invoiceFields = {
  'Invoice No': invoiceNo,
  'Idempotency Key': request.idempotencyKey,
  'Invoice Type': request.invoiceType,
  'Show Quantity': request.showQuantity,
  'Include Due Date': request.includeDueDate,
  Client: request.client.name,
  ...(clientLinkField && metadata.clientRecordId ? { [clientLinkField]: [metadata.clientRecordId] } : {}),
  'Invoice Date': request.invoiceDate,
  ...(request.includeDueDate && dueDate ? { 'Due Date': dueDate.toISOString().slice(0, 10) } : {}),
  'Client Name': request.client.name,
  GSTIN: request.client.gstin,
  State: request.client.state,
  'State Code': request.client.stateCode,
  'Place of Supply': placeOfSupply,
  ...(request.invoiceType === 'proforma' ? {} : { 'GST Type': lineItems[0].gstType }),
  Amount: totals.amount,
  CGST: totals.cgst,
  SGST: totals.sgst,
  IGST: totals.igst,
  Total: totals.total,
  ...(invoiceSacValue !== null ? { SAC: invoiceSacValue } : {}),
  'Reverse Charge': 'No',
  Status: generatedStatusLabel,
  'Total In Words': amountToWords(totals.total)
};

const lineItemFields = lineItems.map((lineItem) => ({
  'Line No': lineItem.lineNumber,
  Description: lineItem.description,
  SAC: normalizeSacValue(lineItem.sac),
  Quantity: lineItem.quantity,
  'Unit Price': lineItem.unitPrice,
  Amount: lineItem.amount,
  'Taxable Value': lineItem.taxableValue,
  CGST: lineItem.cgst,
  SGST: lineItem.sgst,
  IGST: lineItem.igst,
  Total: lineItem.total
}));

return [
  {
    json: {
      request,
      metadata,
      sequence,
      sequenceRecordId: sequenceRecord?.id ?? null,
      invoiceNo,
      invoiceDateDisplay: formatDisplayDate(invoiceDate),
      dueDateDisplay: formatDisplayDate(dueDate),
      placeOfSupply,
      invoiceFields,
      lineItemFields,
      invoiceDocument: {
        idempotencyKey: request.idempotencyKey,
        invoiceNo,
        invoiceType: request.invoiceType,
        showQuantity: request.showQuantity,
        includeDueDate: request.includeDueDate,
        title: request.invoiceType === 'proforma' ? 'Proforma Invoice' : 'Tax Invoice',
        invoiceDate: request.invoiceDate,
        placeOfSupply,
        invoiceDateDisplay: formatDisplayDate(invoiceDate),
        dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : '',
        dueDateDisplay: dueDate ? formatDisplayDate(dueDate) : '',
        gstType: request.invoiceType === 'proforma' ? 'NONE' : lineItems[0].gstType,
        client: request.client,
        company,
        amount: totals.amount,
        taxableValue: totals.amount,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        total: totals.total,
        totalInWords: amountToWords(totals.total),
        sac: invoiceSacValue,
        reverseCharge: 'No',
        paymentTermsLabel: request.includeDueDate ? paymentTermsLabel : '',
        lineItems
      }
    }
  }
];