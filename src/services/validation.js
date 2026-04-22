import { companyProfile } from '../config/company.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeTrimmedString(value, fieldName) {
  assert(typeof value === 'string', `${fieldName} must be a string.`);
  const normalized = value.trim();
  assert(normalized.length > 0, `${fieldName} is required.`);
  return normalized;
}

function normalizeOptionalTrimmedString(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return normalizeTrimmedString(value, fieldName);
}

function normalizePositiveAmount(value, fieldName) {
  const amount = Number(value);
  assert(Number.isFinite(amount) && amount > 0, `${fieldName} must be a positive number.`);
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function normalizeDateString(value, fieldName) {
  const normalized = normalizeTrimmedString(value, fieldName);
  const date = new Date(normalized);
  assert(!Number.isNaN(date.getTime()), `${fieldName} must be a valid date.`);
  return normalized;
}

function calculateLineAmount(quantity, unitPrice) {
  return Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100;
}

function normalizeInvoiceType(value) {
  if (value === undefined || value === null || value === '') {
    return 'tax';
  }

  const normalized = normalizeTrimmedString(value, 'invoiceType').toLowerCase();
  assert(['tax', 'proforma'].includes(normalized), 'invoiceType must be either "tax" or "proforma".');
  return normalized;
}

function normalizeAddressLines(value) {
  if (!value) {
    return [];
  }

  assert(Array.isArray(value), 'client.addressLines must be an array when provided.');
  return value.map((line, index) => normalizeTrimmedString(line, `client.addressLines[${index}]`));
}

function validateGstin(gstin, stateCode) {
  const normalized = normalizeTrimmedString(gstin, 'client.gstin').toUpperCase();
  assert(/^[0-9]{2}[A-Z0-9]{13}$/.test(normalized), 'client.gstin must be a valid 15-character GSTIN.');
  assert(Number(normalized.slice(0, 2)) === Number(stateCode), 'client.gstin state code must match client.stateCode.');
  return normalized;
}

function normalizeLineItems(lineItems, { defaultSac, invoiceType, showQuantity }) {
  assert(Array.isArray(lineItems) && lineItems.length > 0, 'lineItems must contain at least one item.');

  return lineItems.map((lineItem, index) => {
    const quantity = showQuantity
      ? normalizePositiveAmount(lineItem.quantity ?? 1, `lineItems[${index}].quantity`)
      : null;
    const unitPrice = showQuantity
      ? normalizePositiveAmount(lineItem.unitPrice ?? lineItem.unitRate ?? lineItem.amount, `lineItems[${index}].unitPrice`)
      : null;

    return {
      sac:
        normalizeOptionalTrimmedString(lineItem.sac, `lineItems[${index}].sac`) ||
        (invoiceType === 'tax' ? defaultSac : null),
      lineNumber: index + 1,
      description: normalizeTrimmedString(lineItem.description, `lineItems[${index}].description`),
      quantity,
      unitPrice,
      amount: showQuantity
        ? calculateLineAmount(quantity, unitPrice)
        : normalizePositiveAmount(lineItem.amount, `lineItems[${index}].amount`)
    };
  });
}

function normalizeConversionMetadata(payload, invoiceType) {
  const sourceProforma = payload.sourceProforma;
  const purchaseOrder = payload.purchaseOrder;
  const hasSourceProforma = Boolean(sourceProforma);
  const hasPurchaseOrder = Boolean(purchaseOrder);

  if (!hasSourceProforma && !hasPurchaseOrder) {
    return {
      sourceProforma: null,
      purchaseOrder: null
    };
  }

  assert(invoiceType === 'tax', 'Proforma conversion metadata is only supported for tax invoices.');
  assert(hasSourceProforma && hasPurchaseOrder, 'Both sourceProforma and purchaseOrder are required for proforma conversion.');

  return {
    sourceProforma: {
      invoiceRecordId: normalizeOptionalTrimmedString(sourceProforma.invoiceRecordId, 'sourceProforma.invoiceRecordId'),
      invoiceNo: normalizeTrimmedString(sourceProforma.invoiceNo, 'sourceProforma.invoiceNo'),
      invoiceDate: normalizeDateString(sourceProforma.invoiceDate, 'sourceProforma.invoiceDate')
    },
    purchaseOrder: {
      number: normalizeTrimmedString(purchaseOrder.number, 'purchaseOrder.number'),
      date: normalizeDateString(purchaseOrder.date, 'purchaseOrder.date')
    }
  };
}

export function normalizeInvoiceRequest(payload) {
  assert(payload && typeof payload === 'object', 'Invoice payload must be an object.');
  assert(payload.client && typeof payload.client === 'object', 'client is required.');

  const clientStateCode = Number(payload.client.stateCode);
  assert(Number.isInteger(clientStateCode) && clientStateCode > 0, 'client.stateCode must be a positive integer.');

  const defaultSac =
    normalizeOptionalTrimmedString(payload.defaultSac, 'defaultSac') ||
    normalizeOptionalTrimmedString(payload.client.defaultSac, 'client.defaultSac') ||
    companyProfile.defaultSac;
  const invoiceType = normalizeInvoiceType(payload.invoiceType);
  const showQuantity = Boolean(payload.showQuantity);
  const includeDueDate = invoiceType === 'tax' ? true : Boolean(payload.includeDueDate);
  const conversionMetadata = normalizeConversionMetadata(payload, invoiceType);

  const normalized = {
    idempotencyKey: normalizeTrimmedString(payload.idempotencyKey, 'idempotencyKey'),
    invoiceDate: normalizeTrimmedString(payload.invoiceDate, 'invoiceDate'),
    sequence: Number(payload.sequence),
    invoiceType,
    showQuantity,
    includeDueDate,
    sourceProforma: conversionMetadata.sourceProforma,
    purchaseOrder: conversionMetadata.purchaseOrder,
    client: {
      name: normalizeTrimmedString(payload.client.name, 'client.name'),
      gstin: validateGstin(payload.client.gstin, clientStateCode),
      state: normalizeTrimmedString(payload.client.state, 'client.state'),
      stateCode: clientStateCode,
      addressLines: normalizeAddressLines(payload.client.addressLines),
      defaultSac,
      defaultPaymentTermsDays: Number(payload.client.defaultPaymentTermsDays || companyProfile.paymentTermsDays)
    },
    lineItems: normalizeLineItems(payload.lineItems, { defaultSac, invoiceType, showQuantity }),
    companyStateCode: companyProfile.stateCode
  };

  assert(Number.isInteger(normalized.sequence) && normalized.sequence > 0, 'sequence must be a positive integer.');
  return normalized;
}