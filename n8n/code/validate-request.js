const source = $json.body ?? $json;
const headers = $json.headers ?? {};
const env = typeof $env === 'object' && $env !== null ? $env : {};

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

function normalizeSacValue(value, fieldName) {
  const normalized = normalizeOptionalTrimmedString(value, fieldName);

  if (normalized === null) {
    return null;
  }

  return /^\d+$/.test(normalized) ? Number(normalized) : normalized;
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
  assert(lineItems.length <= 15, 'lineItems cannot contain more than 15 items.');

  return lineItems.map((lineItem, index) => {
    const quantity = showQuantity
      ? normalizePositiveAmount(lineItem.quantity ?? 1, `lineItems[${index}].quantity`)
      : null;
    const unitPrice = showQuantity
      ? normalizePositiveAmount(lineItem.unitPrice ?? lineItem.unitRate ?? lineItem.amount, `lineItems[${index}].unitPrice`)
      : null;

    return {
      lineNumber: index + 1,
      description: normalizeTrimmedString(lineItem.description, `lineItems[${index}].description`),
      sac: normalizeSacValue(lineItem.sac, `lineItems[${index}].sac`) || (invoiceType === 'tax' ? defaultSac : null),
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

function toDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  assert(!Number.isNaN(date.getTime()), `Invalid date value: ${value}`);
  return date;
}

function getFinancialYearLabel(value) {
  const date = toDate(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

const expectedSecret = env.N8N_WEBHOOK_SECRET;
const providedSecret = headers['x-webhook-secret'] || headers['X-Webhook-Secret'];

if (expectedSecret) {
  assert(providedSecret === expectedSecret, 'Invalid webhook secret.');
}

assert(source && typeof source === 'object', 'Request body must be an object.');
assert(source.client && typeof source.client === 'object', 'client is required.');

const clientStateCode = Number(source.client.stateCode);
assert(Number.isInteger(clientStateCode) && clientStateCode > 0, 'client.stateCode must be a positive integer.');

const invoiceDate = normalizeTrimmedString(source.invoiceDate, 'invoiceDate');
const financialYear = getFinancialYearLabel(invoiceDate);
const idempotencyKey = normalizeTrimmedString(source.idempotencyKey, 'idempotencyKey');
const invoiceType = normalizeInvoiceType(source.invoiceType);
const showQuantity = Boolean(source.showQuantity);
const includeDueDate = invoiceType === 'tax' ? true : Boolean(source.includeDueDate);
const conversionMetadata = normalizeConversionMetadata(source, invoiceType);
const defaultSac =
  normalizeSacValue(source.defaultSac, 'defaultSac') ||
  normalizeSacValue(source.client.defaultSac, 'client.defaultSac') ||
  normalizeSacValue(env.DEFAULT_SAC, 'DEFAULT_SAC') ||
  '998314';

const request = {
  idempotencyKey,
  invoiceDate,
  invoiceType,
  showQuantity,
  includeDueDate,
  sourceProforma: conversionMetadata.sourceProforma,
  purchaseOrder: conversionMetadata.purchaseOrder,
  client: {
    name: normalizeTrimmedString(source.client.name, 'client.name'),
    gstin: validateGstin(source.client.gstin, clientStateCode),
    state: normalizeTrimmedString(source.client.state, 'client.state'),
    stateCode: clientStateCode,
    addressLines: normalizeAddressLines(source.client.addressLines),
    defaultSac,
    defaultPaymentTermsDays: Number(source.client.defaultPaymentTermsDays || env.PAYMENT_TERMS_DAYS || '10')
  },
  lineItems: normalizeLineItems(source.lineItems, { defaultSac, invoiceType, showQuantity })
};

return [
  {
    json: {
      request,
      metadata: {
        financialYear,
        companyStateCode: Number(env.COMPANY_STATE_CODE || '24'),
        companyGstin: env.COMPANY_GSTIN || env.COMPANY_GST || null,
        paymentTermsDays: Number(env.PAYMENT_TERMS_DAYS || '10'),
        defaultSac,
        defaultGstRate: Number(env.DEFAULT_GST_RATE || '0.18'),
        invoicesFilterFormula: `{Idempotency Key}='${idempotencyKey.replaceAll("'", "\\'")}'`,
          sequenceFilterFormula: `AND({Financial Year}='${financialYear}', {Type}='${invoiceType}')`,
        clientsFilterFormula: `{GSTIN}='${request.client.gstin.replaceAll("'", "\\'")}'`
      }
    }
  }
];