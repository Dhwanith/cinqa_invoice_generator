import crypto from 'node:crypto';

import { getClientById, getClientByGstin } from '../repositories/supabase/client-repository.js';
import { getInvoiceDetail, createInvoice, getInvoiceByIdempotencyKey } from '../repositories/supabase/invoice-repository.js';
import { buildInvoiceDocument } from './invoice.js';
import { getFinancialYearLabel, formatDisplayDate } from './financial-year.js';
import { getSupabaseClient, getDefaultOrgId } from '../lib/supabase.js';

export class WorkflowError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'WorkflowError';
    this.statusCode = statusCode;
  }
}

export async function resolveInvoiceClient(invoice) {
  if (invoice.clientRecordId) {
    return getClientById(invoice.clientRecordId);
  }

  if (invoice.gstin) {
    const client = await getClientByGstin(invoice.gstin);
    if (client) return client;
  }

  throw new WorkflowError(
    409,
    `Unable to resolve the client record for ${invoice.invoiceNo}. ` +
    `Ensure the invoice has a linked client or a GSTIN matching a client record.`
  );
}

async function allocateSequence(invoiceDate, invoiceType) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();
  const financialYear = getFinancialYearLabel(new Date(invoiceDate));

  const { data: sequence, error } = await supabase.rpc('next_invoice_sequence', {
    p_organization_id: orgId,
    p_financial_year: financialYear,
    p_invoice_type: invoiceType
  });

  if (error) {
    throw new WorkflowError(500, `Failed to allocate invoice sequence: ${error.message}`);
  }

  return sequence;
}

export async function createInvoiceFromClient({
  clientId,
  invoiceDate,
  lineItems,
  invoiceType,
  showQuantity,
  includeDueDate
}) {
  const orgId = getDefaultOrgId();
  const normalizedType = invoiceType || 'tax';

  // Fetch client and allocate sequence in parallel
  const [client, sequence] = await Promise.all([
    getClientById(clientId),
    allocateSequence(invoiceDate, normalizedType)
  ]);

  const idempotencyKey = `ui-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  // buildInvoiceDocument validates inputs and computes all tax fields
  const invoiceDoc = buildInvoiceDocument({
    idempotencyKey,
    invoiceDate,
    sequence,
    invoiceType: normalizedType,
    showQuantity,
    includeDueDate,
    client: {
      name: client.name,
      gstin: client.gstin,
      state: client.state,
      stateCode: client.stateCode,
      addressLines: client.addressLines,
      defaultSac: client.defaultSac,
      defaultPaymentTermsDays: client.defaultPaymentTermsDays
    },
    lineItems
  });

  return createInvoice({ organizationId: orgId, clientId: client.id, invoiceDoc });
}

export async function convertProformaToTaxInvoice({
  invoiceId,
  purchaseOrderNumber,
  purchaseOrderDate,
  invoiceDate,
  sac
}) {
  const proformaInvoice = await getInvoiceDetail(invoiceId);

  if (proformaInvoice.invoiceType !== 'proforma') {
    throw new WorkflowError(400, 'Only proforma invoices can be converted to tax invoices.');
  }

  const orgId = getDefaultOrgId();
  const client = await resolveInvoiceClient(proformaInvoice);
  const overrideSac = sac ? String(sac).trim() : '';
  const effectiveDate = invoiceDate || new Date().toISOString().slice(0, 10);

  const lineItems = (proformaInvoice.lineItems || []).map((li) => ({
    description: li.description,
    sac: overrideSac || li.sac || '',
    amount: li.amount,
    quantity: li.quantity,
    unitPrice: li.unitPrice
  }));

  const sequence = await allocateSequence(effectiveDate, 'tax');
  const idempotencyKey = `convert-${proformaInvoice.id}-${Date.now()}`;

  const invoiceDoc = buildInvoiceDocument({
    idempotencyKey,
    invoiceDate: effectiveDate,
    sequence,
    invoiceType: 'tax',
    showQuantity: Boolean(proformaInvoice.showQuantity),
    includeDueDate: true,
    client: {
      name: client.name,
      gstin: client.gstin,
      state: client.state,
      stateCode: client.stateCode,
      addressLines: client.addressLines,
      defaultSac: client.defaultSac,
      defaultPaymentTermsDays: client.defaultPaymentTermsDays
    },
    lineItems,
    sourceProforma: {
      invoiceRecordId: proformaInvoice.id,
      invoiceNo: proformaInvoice.invoiceNo,
      invoiceDate: proformaInvoice.invoiceDate
    },
    purchaseOrder: {
      number: purchaseOrderNumber,
      date: purchaseOrderDate
    }
  });

  return createInvoice({ organizationId: orgId, clientId: client.id, invoiceDoc });
}

/**
 * Creates an invoice from a raw n8n-compatible webhook payload.
 *
 * Differences from createInvoiceFromClient:
 *  - Accepts a full inline client object (GSTIN-based lookup, no clientId required)
 *  - Caller supplies idempotencyKey — idempotent: same key returns the existing invoice
 *  - `sequence` in the payload is IGNORED — the atomic PG function always wins
 *  - Validation errors throw WorkflowError(400) so the webhook returns a proper 400
 */
export async function createInvoiceFromWebhookPayload(payload) {
  const orgId = getDefaultOrgId();

  // ── Idempotency check ──────────────────────────────────────────────────────
  if (payload.idempotencyKey) {
    const existing = await getInvoiceByIdempotencyKey(payload.idempotencyKey, orgId);
    if (existing) return { ...existing, duplicate: true };
  }

  const normalizedType = payload.invoiceType || 'tax';
  const invoiceDate = String(payload.invoiceDate || '');

  // ── Client resolution ─────────────────────────────────────────────────────
  // Prefer a stored client (full address, correct SAC defaults).
  // Fall back to the inline payload client data if no DB record exists.
  let storedClient = null;
  if (payload.client?.gstin) {
    storedClient = await getClientByGstin(payload.client.gstin);
  }

  const clientData = storedClient ?? {
    id: null,
    name: payload.client?.name || '',
    gstin: payload.client?.gstin || '',
    state: payload.client?.state || '',
    stateCode: Number(payload.client?.stateCode || 0),
    addressLines: Array.isArray(payload.client?.addressLines) ? payload.client.addressLines : [],
    defaultSac: payload.client?.defaultSac || process.env.DEFAULT_SAC || '998314',
    defaultPaymentTermsDays: Number(payload.client?.defaultPaymentTermsDays || process.env.PAYMENT_TERMS_DAYS || 10)
  };

  // ── Atomic sequence ────────────────────────────────────────────────────────
  const sequence = await allocateSequence(invoiceDate, normalizedType);

  // ── Build & validate invoice document ─────────────────────────────────────
  // buildInvoiceDocument runs normalizeInvoiceRequest internally — all field
  // validation happens here. Re-throw its errors as 400 WorkflowErrors.
  let invoiceDoc;
  try {
    invoiceDoc = buildInvoiceDocument({
      idempotencyKey: payload.idempotencyKey,
      invoiceDate,
      sequence,
      invoiceType: normalizedType,
      showQuantity: Boolean(payload.showQuantity),
      includeDueDate: normalizedType === 'tax' ? true : Boolean(payload.includeDueDate),
      ...(payload.sourceProforma ? { sourceProforma: payload.sourceProforma } : {}),
      ...(payload.purchaseOrder ? { purchaseOrder: payload.purchaseOrder } : {}),
      client: {
        name: clientData.name,
        gstin: clientData.gstin,
        state: clientData.state,
        stateCode: clientData.stateCode,
        addressLines: clientData.addressLines,
        defaultSac: clientData.defaultSac,
        defaultPaymentTermsDays: clientData.defaultPaymentTermsDays
      },
      lineItems: payload.lineItems
    });
  } catch (error) {
    throw new WorkflowError(400, error.message);
  }

  const result = await createInvoice({ organizationId: orgId, clientId: storedClient?.id || null, invoiceDoc });
  return { ...result, duplicate: false };
}

export function buildInvoiceDocumentFromSnapshot(invoiceRecord, clientRecord) {
  const invoiceDate = new Date(invoiceRecord.invoiceDate);
  const dueDate = invoiceRecord.dueDate ? new Date(invoiceRecord.dueDate) : null;
  const invoiceType = invoiceRecord.invoiceType || 'tax';
  const showQuantity = Boolean(invoiceRecord.showQuantity);
  const includeDueDate = invoiceRecord.includeDueDate !== false;

  const lineItems = (invoiceRecord.lineItems || []).map((li) => {
    const price = showQuantity
      ? li.unitPrice
      : invoiceType === 'tax'
      ? li.taxableValue || li.amount
      : li.amount;
    return {
      lineNumber: li.lineNumber,
      description: li.description,
      sac: li.sac || '',
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      price,
      amount: li.amount,
      taxableValue: li.taxableValue || li.amount,
      cgst: li.cgst || 0,
      sgst: li.sgst || 0,
      igst: li.igst || 0,
      total: li.total || li.amount
    };
  });

  const sourceProforma = invoiceRecord.sourceProforma
    ? {
        ...invoiceRecord.sourceProforma,
        invoiceDateDisplay: invoiceRecord.sourceProforma.invoiceDate
          ? formatDisplayDate(new Date(invoiceRecord.sourceProforma.invoiceDate))
          : ''
      }
    : null;

  const purchaseOrder = invoiceRecord.purchaseOrder
    ? {
        ...invoiceRecord.purchaseOrder,
        dateDisplay: invoiceRecord.purchaseOrder.date
          ? formatDisplayDate(new Date(invoiceRecord.purchaseOrder.date))
          : ''
      }
    : null;

  const company = getCompanyProfile();
  const paymentTermsDays = clientRecord?.defaultPaymentTermsDays || company.paymentTermsDays;

  return {
    idempotencyKey: invoiceRecord.idempotencyKey || '',
    invoiceNo: invoiceRecord.invoiceNo,
    invoiceType,
    showQuantity,
    includeDueDate,
    title: invoiceType === 'proforma' ? 'Proforma Invoice' : 'Tax Invoice',
    invoiceDate: invoiceRecord.invoiceDate,
    invoiceDateDisplay: formatDisplayDate(invoiceDate),
    dueDate: invoiceRecord.dueDate || '',
    dueDateDisplay: dueDate ? formatDisplayDate(dueDate) : '',
    sourceProforma,
    purchaseOrder,
    placeOfSupply: invoiceRecord.placeOfSupply || '',
    gstType: invoiceRecord.gstType || 'NONE',
    client: {
      name: invoiceRecord.clientName,
      gstin: invoiceRecord.gstin,
      state: invoiceRecord.state,
      stateCode: invoiceRecord.stateCode,
      addressLines: clientRecord?.addressLines || []
    },
    company,
    lineItems,
    taxableValue: invoiceRecord.amount,
    amount: invoiceRecord.amount,
    cgst: invoiceRecord.cgst,
    sgst: invoiceRecord.sgst,
    igst: invoiceRecord.igst,
    total: invoiceRecord.total,
    totalInWords: invoiceRecord.totalInWords || '',
    sac: invoiceRecord.sac || '',
    reverseCharge: invoiceRecord.reverseCharge || 'No',
    paymentTermsLabel: includeDueDate ? `Net ${paymentTermsDays} days` : ''
  };
}

function getCompanyProfile() {
  return {
    name: process.env.COMPANY_NAME || 'Cinqa Tech Solutions LLP',
    gstin: process.env.COMPANY_GSTIN || process.env.COMPANY_GST || '24AAWFC2925N1ZX',
    pan: process.env.COMPANY_PAN || 'AAWFC2925N',
    tan: process.env.COMPANY_TAN || 'SRTC05319G',
    state: process.env.COMPANY_STATE || 'Gujarat',
    stateCode: Number(process.env.COMPANY_STATE_CODE || '24'),
    addressLines: [
      process.env.COMPANY_ADDRESS_LINE_1 || '47/107, Soham Park, Saraswat Nagar',
      process.env.COMPANY_ADDRESS_LINE_2 || 'Piplod, Surat - 395007, GJ(24)'
    ],
    email: process.env.COMPANY_EMAIL || 'tarunchelumalla@cinqa.space',
    website: process.env.COMPANY_WEBSITE || 'www.cinqa.space',
    bankAccountName: process.env.BANK_ACCOUNT_NAME || 'CINQA TECH SOLUTIONS LLP',
    bankName: process.env.BANK_NAME || 'Axis Bank',
    bankAccountNumber: process.env.BANK_ACCOUNT_NUMBER || '926020012433774',
    bankBranchName: process.env.BANK_BRANCH_NAME || 'Parle Point, Surat',
    bankIfsc: process.env.BANK_IFSC || 'UTIB0005112',
    authorizedSignatory: process.env.AUTHORIZED_SIGNATORY || 'Authorized Signatory',
    paymentTermsDays: Number(process.env.PAYMENT_TERMS_DAYS || '10'),
    defaultSac: process.env.DEFAULT_SAC || '998314',
    defaultGstRate: Number(process.env.DEFAULT_GST_RATE || '0.18')
  };
}
