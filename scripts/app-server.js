import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import express from 'express';

import { normalizeInvoiceRequest } from '../src/services/validation.js';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const rootDir = path.resolve(currentDir, '..');
const parentDir = path.dirname(rootDir);
const frontendDistDir = path.join(rootDir, 'frontend', 'dist');

dotenv.config({ path: path.join(rootDir, '.env'), quiet: true });
dotenv.config({ path: path.join(parentDir, '.env'), override: false, quiet: true });

const DEFAULT_AIRTABLE_TABLES = {
  clients: 'clients',
  invoices: 'invoices',
  lineItems: 'invoice_line_items'
};
const APP_SESSION_COOKIE_NAME = 'cinqa_operator_session';

function getEnv(name, fallback = null) {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function hasEnv(name) {
  return Boolean(getEnv(name));
}

function requireEnv(name) {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function buildInvoiceWebhookUrl() {
  const explicit = getEnv('CREATE_INVOICE_WEBHOOK_URL');
  if (explicit) {
    return explicit;
  }

  const base = getEnv('WEBHOOK_URL');
  if (!base) {
    throw new Error('Missing CREATE_INVOICE_WEBHOOK_URL or WEBHOOK_URL environment variable.');
  }

  return `${base.replace(/\/$/, '')}/webhook/create-invoice`;
}

function getConfiguredInvoiceWebhookUrl() {
  try {
    return buildInvoiceWebhookUrl();
  } catch {
    return null;
  }
}

function getInvoiceWebhookSource() {
  if (hasEnv('CREATE_INVOICE_WEBHOOK_URL')) {
    return 'CREATE_INVOICE_WEBHOOK_URL';
  }

  if (hasEnv('WEBHOOK_URL')) {
    return 'WEBHOOK_URL';
  }

  return null;
}

function getFrontendStaticDir() {
  return existsSync(frontendDistDir) ? frontendDistDir : null;
}

function buildHealthWarnings(createInvoiceWebhookUrl) {
  const warnings = [];

  if (!hasEnv('AIRTABLE_API_TOKEN')) {
    warnings.push('AIRTABLE_API_TOKEN is missing.');
  }

  if (!hasEnv('AIRTABLE_BASE_ID')) {
    warnings.push('AIRTABLE_BASE_ID is missing.');
  }

  if (!createInvoiceWebhookUrl) {
    warnings.push('CREATE_INVOICE_WEBHOOK_URL or WEBHOOK_URL is missing.');
  }

  if (!isAppAuthConfigured()) {
    warnings.push('APP_AUTH_USERNAME, APP_AUTH_PASSWORD, or APP_SESSION_SECRET is missing.');
  }

  return warnings;
}

function buildHealthPayload() {
  const createInvoiceWebhookUrl = getConfiguredInvoiceWebhookUrl();
  const airtableConfigured = hasEnv('AIRTABLE_API_TOKEN') && hasEnv('AIRTABLE_BASE_ID');
  const invoiceWebhookConfigured = Boolean(createInvoiceWebhookUrl);

  return {
    ok: true,
    appName: 'Cinqa Invoice Desk',
    appAuthConfigured: isAppAuthConfigured(),
    companyStateCode: Number(getEnv('COMPANY_STATE_CODE', '24')),
    defaultSac: getEnv('DEFAULT_SAC', '998314'),
    paymentTermsDays: Number(getEnv('PAYMENT_TERMS_DAYS', '10')),
    airtableConfigured,
    invoiceWebhookConfigured,
    createInvoiceWebhookUrl,
    config: {
      airtable: {
        hasApiToken: hasEnv('AIRTABLE_API_TOKEN'),
        hasBaseId: hasEnv('AIRTABLE_BASE_ID'),
        tables: {
          clients: getAirtableTableName('clients'),
          invoices: getAirtableTableName('invoices'),
          lineItems: getAirtableTableName('lineItems')
        }
      },
      webhook: {
        source: getInvoiceWebhookSource(),
        url: createInvoiceWebhookUrl
      }
    },
    warnings: buildHealthWarnings(createInvoiceWebhookUrl)
  };
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

function getAppAuthConfig() {
  return {
    username: getEnv('APP_AUTH_USERNAME'),
    password: getEnv('APP_AUTH_PASSWORD'),
    sessionSecret: getEnv('APP_SESSION_SECRET')
  };
}

function isAppAuthConfigured() {
  const { username, password, sessionSecret } = getAppAuthConfig();
  return Boolean(username && password && sessionSecret);
}

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex === -1) {
          return [part, ''];
        }

        return [part.slice(0, separatorIndex), decodeURIComponent(part.slice(separatorIndex + 1))];
      })
  );
}

function getAuthCookieValue(request) {
  const cookies = parseCookies(request.headers.cookie || '');
  return cookies[APP_SESSION_COOKIE_NAME] || null;
}

function createSessionSignature(payload) {
  const sessionSecret = getAppAuthConfig().sessionSecret;
  if (!sessionSecret) {
    throw new Error('APP_SESSION_SECRET is not configured.');
  }

  return crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
}

function createAuthSessionToken(username) {
  const ttlHours = Number(getEnv('APP_SESSION_TTL_HOURS', '12'));
  const expiresAt = Date.now() + ttlHours * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ username, expiresAt }), 'utf8').toString('base64url');
  return `${payload}.${createSessionSignature(payload)}`;
}

function verifyAuthSessionToken(token) {
  if (!token || !token.includes('.')) {
    return null;
  }

  const [payload, providedSignature] = token.split('.');
  const expectedSignature = createSessionSignature(payload);
  const providedBuffer = Buffer.from(providedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session || typeof session.username !== 'string' || Number(session.expiresAt) <= Date.now()) {
      return null;
    }

    return {
      username: session.username,
      expiresAt: Number(session.expiresAt)
    };
  } catch {
    return null;
  }
}

function getAuthSession(request) {
  if (!isAppAuthConfigured()) {
    return null;
  }

  return verifyAuthSessionToken(getAuthCookieValue(request));
}

function isSecureCookieRequest(request) {
  const explicit = getEnv('APP_COOKIE_SECURE');
  if (explicit) {
    return explicit.toLowerCase() === 'true';
  }

  return request.secure || request.get('x-forwarded-proto') === 'https';
}

function setAuthSessionCookie(request, response, username) {
  const ttlHours = Number(getEnv('APP_SESSION_TTL_HOURS', '12'));
  response.cookie(APP_SESSION_COOKIE_NAME, createAuthSessionToken(username), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookieRequest(request),
    path: '/',
    maxAge: ttlHours * 60 * 60 * 1000
  });
}

function clearAuthSessionCookie(request, response) {
  response.clearCookie(APP_SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookieRequest(request),
    path: '/'
  });
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAuthenticatedApp(request, response, next) {
  if (!isAppAuthConfigured()) {
    response.status(503).json({ ok: false, error: 'App authentication is not configured.' });
    return;
  }

  const session = getAuthSession(request);
  if (!session) {
    response.status(401).json({ ok: false, error: 'Authentication required.' });
    return;
  }

  request.authSession = session;
  next();
}

function buildAirtableTableUrl(tableName) {
  const baseId = requireEnv('AIRTABLE_BASE_ID');
  return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
}

function getAirtableTableName(kind) {
  const tableMap = {
    clients: getEnv('AIRTABLE_TABLE_CLIENTS', DEFAULT_AIRTABLE_TABLES.clients),
    invoices: getEnv('AIRTABLE_TABLE_INVOICES', DEFAULT_AIRTABLE_TABLES.invoices),
    lineItems: getEnv('AIRTABLE_TABLE_LINE_ITEMS', DEFAULT_AIRTABLE_TABLES.lineItems)
  };

  return tableMap[kind];
}

function buildAirtableHeaders() {
  return {
    Authorization: `Bearer ${requireEnv('AIRTABLE_API_TOKEN')}`,
    'Content-Type': 'application/json'
  };
}

function escapeFormulaValue(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

async function airtableRequest(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...buildAirtableHeaders(),
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Airtable request failed (${response.status}): ${errorText}`);
  }

  return response.status === 204 ? null : response.json();
}

function normalizeClientFields(fields, recordId) {
  const addressLines = [fields['Address Line 1'], fields['Address Line 2'], fields['Address Line 3']].filter(Boolean);
  const activeValue = fields.Active;
  const isActive =
    activeValue === undefined ||
    activeValue === null ||
    activeValue === true ||
    String(activeValue).toLowerCase() === 'active';

  return {
    id: recordId,
    name: fields['Client Name'] || '',
    gstin: fields.GSTIN || '',
    state: fields.State || '',
    stateCode: Number(fields['State Code'] || 0),
    addressLines,
    defaultSac: fields['Default SAC'] === undefined || fields['Default SAC'] === null ? '' : String(fields['Default SAC']),
    defaultPaymentTermsDays: Number(fields['Default Payment Terms Days'] || 0),
    email: fields.Email || '',
    phone: fields.Phone || '',
    active: isActive,
    notes: fields.Notes || ''
  };
}

function normalizeInvoiceSummary(record) {
  const fields = record.fields || {};
  return {
    id: record.id,
    invoiceNo: fields['Invoice No'] || '',
    idempotencyKey: fields['Idempotency Key'] || '',
    invoiceType: fields['Invoice Type'] || 'tax',
    showQuantity: fields['Show Quantity'] === true || String(fields['Show Quantity']).toLowerCase() === 'true',
    includeDueDate:
      fields['Include Due Date'] === undefined ||
      fields['Include Due Date'] === null ||
      fields['Include Due Date'] === ''
        ? true
        : fields['Include Due Date'] === true || String(fields['Include Due Date']).toLowerCase() === 'true',
    invoiceDate: fields['Invoice Date'] || '',
    dueDate: fields['Due Date'] || '',
    clientName: fields['Client Name'] || fields.Client || '',
    gstin: fields.GSTIN || '',
    state: fields.State || '',
    stateCode: Number(fields['State Code'] || 0),
    placeOfSupply: fields['Place of Supply'] || '',
    gstType: fields['GST Type'] || '',
    amount: Number(fields.Amount || 0),
    cgst: Number(fields.CGST || 0),
    sgst: Number(fields.SGST || 0),
    igst: Number(fields.IGST || 0),
    total: Number(fields.Total || 0),
    sac: fields.SAC || '',
    reverseCharge: fields['Reverse Charge'] || '',
    status: fields.Status || '',
    totalInWords: fields['Total In Words'] || '',
    googleDriveUrl: fields['Google Drive URL'] || '',
    googleDriveFileId: fields['Google Drive File ID'] || ''
  };
}

function buildInvoiceFilterFormula({ search, status }) {
  const clauses = [];

  if (search) {
    const value = escapeFormulaValue(search.toLowerCase());
    clauses.push(
      `OR(SEARCH(LOWER("${value}"), LOWER({Invoice No})) > 0, SEARCH(LOWER("${value}"), LOWER({Client Name})) > 0)`
    );
  }

  if (status && status !== 'all') {
    clauses.push(`LOWER({Status} & "") = "${escapeFormulaValue(status.toLowerCase())}"`);
  }

  if (clauses.length === 0) {
    return null;
  }

  return clauses.length === 1 ? clauses[0] : `AND(${clauses.join(',')})`;
}

function normalizeInvoiceLineItem(record) {
  const fields = record.fields || {};
  return {
    id: record.id,
    invoiceNo: fields['Invoice No'] || '',
    lineNumber: Number(fields['Line No'] || 0),
    description: fields.Description || '',
    sac: fields.SAC || '',
    quantity: fields.Quantity === undefined || fields.Quantity === null ? null : Number(fields.Quantity),
    unitPrice:
      fields['Unit Price'] === undefined || fields['Unit Price'] === null
        ? fields['Unit Rate'] === undefined || fields['Unit Rate'] === null
          ? null
          : Number(fields['Unit Rate'])
        : Number(fields['Unit Price']),
    amount: Number(fields.Amount || 0),
    taxableValue: Number(fields['Taxable Value'] || 0),
    cgst: Number(fields.CGST || 0),
    sgst: Number(fields.SGST || 0),
    igst: Number(fields.IGST || 0),
    total: Number(fields.Total || 0)
  };
}

function validateTrimmedString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${fieldName} is required.`);
  }

  return value.trim();
}

function validateOptionalString(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

function validatePositiveAmount(value, fieldName) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, `${fieldName} must be a positive number.`);
  }

  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function validateClientPayload(payload) {
  const name = validateTrimmedString(payload.name, 'Client Name');
  const gstin = validateTrimmedString(payload.gstin, 'GSTIN').toUpperCase();
  const state = validateTrimmedString(payload.state, 'State');
  const stateCode = Number(payload.stateCode);

  if (!/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) {
    throw new HttpError(400, 'GSTIN must be a valid 15-character GSTIN.');
  }

  if (!Number.isInteger(stateCode) || stateCode <= 0) {
    throw new HttpError(400, 'State Code must be a positive integer.');
  }

  if (Number(gstin.slice(0, 2)) !== stateCode) {
    throw new HttpError(400, 'GSTIN state code must match State Code.');
  }

  return {
    name,
    gstin,
    state,
    stateCode,
    addressLine1: validateTrimmedString(payload.addressLine1, 'Address Line 1'),
    addressLine2: validateOptionalString(payload.addressLine2),
    addressLine3: validateOptionalString(payload.addressLine3),
    defaultSac: validateOptionalString(payload.defaultSac) || getEnv('DEFAULT_SAC', '998314'),
    defaultPaymentTermsDays: Number(payload.defaultPaymentTermsDays || getEnv('PAYMENT_TERMS_DAYS', '10')),
    email: validateOptionalString(payload.email),
    phone: validateOptionalString(payload.phone),
    notes: validateOptionalString(payload.notes),
    active: payload.active === undefined ? true : Boolean(payload.active)
  };
}

function normalizeSacForAirtable(value) {
  const normalizedValue = validateOptionalString(value);
  if (!normalizedValue) {
    return '';
  }

  return /^[0-9]+$/.test(normalizedValue) ? Number(normalizedValue) : normalizedValue;
}

function buildClientAirtableFields(client) {
  return {
    'Client Name': client.name,
    GSTIN: client.gstin,
    State: client.state,
    'State Code': client.stateCode,
    'Address Line 1': client.addressLine1,
    'Address Line 2': client.addressLine2,
    'Address Line 3': client.addressLine3,
    'Default SAC': normalizeSacForAirtable(client.defaultSac),
    'Default Payment Terms Days': client.defaultPaymentTermsDays,
    Email: client.email,
    Phone: client.phone,
    Active: client.active,
    Notes: client.notes
  };
}

async function listClients(search = '') {
  const tableName = requireEnv('AIRTABLE_TABLE_CLIENTS');
  const query = new URLSearchParams();
  query.set('pageSize', '100');
  query.append('sort[0][field]', 'Client Name');
  query.append('sort[0][direction]', 'asc');

  if (search) {
    query.set(
      'filterByFormula',
      `SEARCH(LOWER("${escapeFormulaValue(search)}"), LOWER({Client Name}))`
    );
  }

  const response = await airtableRequest(`${buildAirtableTableUrl(tableName)}?${query.toString()}`);
  return (response.records || []).map((record) => normalizeClientFields(record.fields || {}, record.id));
}

function buildClientFilterFormula({ search, active }) {
  const clauses = [];

  if (search) {
    const value = escapeFormulaValue(search.toLowerCase());
    clauses.push(`OR(SEARCH(LOWER("${value}"), LOWER({Client Name})) > 0, SEARCH(LOWER("${value}"), LOWER({GSTIN})) > 0)`);
  }

  if (active === 'active') {
    clauses.push('OR({Active} = BLANK(), {Active} = 1, LOWER({Active} & "") = "active", {Active} = TRUE())');
  }

  if (active === 'inactive') {
    clauses.push('AND({Active} != BLANK(), NOT(OR({Active} = 1, LOWER({Active} & "") = "active", {Active} = TRUE())))');
  }

  if (clauses.length === 0) {
    return null;
  }

  return clauses.length === 1 ? clauses[0] : `AND(${clauses.join(',')})`;
}

async function queryClients({ search = '', active = 'all' } = {}) {
  const tableName = getAirtableTableName('clients');
  const query = new URLSearchParams();
  query.set('pageSize', '100');
  query.append('sort[0][field]', 'Client Name');
  query.append('sort[0][direction]', 'asc');

  const filterByFormula = buildClientFilterFormula({ search, active });
  if (filterByFormula) {
    query.set('filterByFormula', filterByFormula);
  }

  const response = await airtableRequest(`${buildAirtableTableUrl(tableName)}?${query.toString()}`);
  return (response.records || []).map((record) => normalizeClientFields(record.fields || {}, record.id));
}

async function getClientRecord(clientId) {
  const tableName = getAirtableTableName('clients');
  const record = await airtableRequest(`${buildAirtableTableUrl(tableName)}/${clientId}`);
  return normalizeClientFields(record.fields || {}, record.id);
}

async function createClient(payload) {
  const client = validateClientPayload(payload);
  const tableName = getAirtableTableName('clients');
  const body = {
    fields: buildClientAirtableFields(client)
  };

  const response = await airtableRequest(buildAirtableTableUrl(tableName), {
    method: 'POST',
    body: JSON.stringify(body)
  });

  return normalizeClientFields(response.fields || {}, response.id);
}

async function updateClient(clientId, payload) {
  const normalizedClientId = validateTrimmedString(clientId, 'Client ID');
  const client = validateClientPayload(payload);
  const tableName = getAirtableTableName('clients');
  const body = {
    fields: buildClientAirtableFields(client)
  };

  const response = await airtableRequest(`${buildAirtableTableUrl(tableName)}/${normalizedClientId}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });

  return normalizeClientFields(response.fields || {}, response.id);
}

async function listInvoices({ search = '', status = 'all' } = {}) {
  const tableName = getAirtableTableName('invoices');
  const query = new URLSearchParams();
  query.set('pageSize', '50');
  query.append('sort[0][field]', 'Invoice Date');
  query.append('sort[0][direction]', 'desc');

  const filterByFormula = buildInvoiceFilterFormula({ search, status });
  if (filterByFormula) {
    query.set('filterByFormula', filterByFormula);
  }

  const response = await airtableRequest(`${buildAirtableTableUrl(tableName)}?${query.toString()}`);
  return (response.records || []).map(normalizeInvoiceSummary);
}

async function getInvoiceRecord(invoiceId) {
  const tableName = getAirtableTableName('invoices');
  const record = await airtableRequest(`${buildAirtableTableUrl(tableName)}/${validateTrimmedString(invoiceId, 'Invoice ID')}`);
  return normalizeInvoiceSummary(record);
}

async function listInvoiceLineItems(invoiceNo) {
  const tableName = getAirtableTableName('lineItems');
  const query = new URLSearchParams();
  query.set('pageSize', '100');
  query.append('sort[0][field]', 'Line No');
  query.append('sort[0][direction]', 'asc');
  query.set('filterByFormula', `{Invoice No} = "${escapeFormulaValue(invoiceNo)}"`);

  const response = await airtableRequest(`${buildAirtableTableUrl(tableName)}?${query.toString()}`);
  return (response.records || []).map(normalizeInvoiceLineItem);
}

async function getInvoiceDetail(invoiceId) {
  const invoice = await getInvoiceRecord(invoiceId);
  const lineItems = invoice.invoiceNo ? await listInvoiceLineItems(invoice.invoiceNo) : [];
  return {
    ...invoice,
    lineItems
  };
}

async function deleteAirtableRecord(tableName, recordId) {
  await airtableRequest(`${buildAirtableTableUrl(tableName)}/${validateTrimmedString(recordId, 'Record ID')}`, {
    method: 'DELETE'
  });
}

async function deleteInvoice(invoiceId) {
  const invoice = await getInvoiceDetail(invoiceId);
  const lineItemsTableName = getAirtableTableName('lineItems');
  const invoicesTableName = getAirtableTableName('invoices');

  for (const lineItem of invoice.lineItems || []) {
    await deleteAirtableRecord(lineItemsTableName, lineItem.id);
  }

  await deleteAirtableRecord(invoicesTableName, invoice.id);

  return {
    invoiceId: invoice.id,
    invoiceNo: invoice.invoiceNo,
    deletedLineItems: (invoice.lineItems || []).length
  };
}

function validateInvoiceStatus(status) {
  const normalizedStatus = validateTrimmedString(status, 'Status').toLowerCase();
  const allowedStatuses = new Set(['generated', 'sent', 'paid']);
  if (!allowedStatuses.has(normalizedStatus)) {
    throw new HttpError(400, 'Status must be one of: generated, sent, paid.');
  }

  return normalizedStatus;
}

function formatInvoiceStatusLabel(status) {
  const normalizedStatus = validateInvoiceStatus(status);
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
}

function buildInvoiceStatusCandidates(status) {
  const normalizedStatus = validateInvoiceStatus(status);
  return [...new Set([normalizedStatus, formatInvoiceStatusLabel(normalizedStatus)])];
}

function isAirtableStatusValueError(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('INVALID_MULTIPLE_CHOICE_OPTIONS') ||
    (error.message.includes('INVALID_VALUE_FOR_COLUMN') && error.message.includes('Status'))
  );
}

async function patchInvoiceStatusRecord(invoiceId, statusValue) {
  const tableName = getAirtableTableName('invoices');
  const response = await airtableRequest(`${buildAirtableTableUrl(tableName)}/${invoiceId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        Status: statusValue
      }
    })
  });

  return normalizeInvoiceSummary(response);
}

async function updateInvoiceStatus(invoiceId, status) {
  const normalizedInvoiceId = validateTrimmedString(invoiceId, 'Invoice ID');
  const statusCandidates = buildInvoiceStatusCandidates(status);
  let lastError = null;

  for (const statusCandidate of statusCandidates) {
    try {
      return await patchInvoiceStatusRecord(normalizedInvoiceId, statusCandidate);
    } catch (error) {
      lastError = error;
      if (!isAirtableStatusValueError(error) || statusCandidate === statusCandidates.at(-1)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error('Unable to update invoice status.');
}

function normalizeInvoiceLineItems(lineItems, showQuantity) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new HttpError(400, 'At least one line item is required.');
  }

  return lineItems.map((lineItem, index) => ({
    description: validateTrimmedString(lineItem.description, `Line item ${index + 1} description`),
    sac: validateOptionalString(lineItem.sac),
    quantity:
      !showQuantity || lineItem.quantity === undefined || lineItem.quantity === null || lineItem.quantity === ''
        ? null
        : validatePositiveAmount(lineItem.quantity, `Line item ${index + 1} quantity`),
    unitPrice:
      !showQuantity || lineItem.unitPrice === undefined || lineItem.unitPrice === null || lineItem.unitPrice === ''
        ? null
        : validatePositiveAmount(lineItem.unitPrice, `Line item ${index + 1} unit price`),
    amount: showQuantity
      ? validatePositiveAmount(
          Number(lineItem.quantity || 1) * Number(lineItem.unitPrice || lineItem.amount),
          `Line item ${index + 1} amount`
        )
      : validatePositiveAmount(lineItem.amount, `Line item ${index + 1} amount`)
  }));
}

function buildInvoicePayload({ invoiceDate, client, lineItems, invoiceType, showQuantity, includeDueDate }) {
  return normalizeInvoiceRequest({
    idempotencyKey: `ui-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    invoiceDate,
    sequence: 1,
    invoiceType,
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
}

async function createInvoiceFromClient({ clientId, invoiceDate, lineItems, invoiceType, showQuantity, includeDueDate }) {
  const createInvoiceWebhookUrl = getConfiguredInvoiceWebhookUrl();
  if (!createInvoiceWebhookUrl) {
    throw new HttpError(500, 'Create invoice webhook URL is not configured.');
  }

  const webhookSecret = getEnv('N8N_WEBHOOK_SECRET');

  const client = await getClientRecord(clientId);
  const payload = buildInvoicePayload({
    invoiceDate: validateTrimmedString(invoiceDate, 'Invoice Date'),
    client,
    lineItems: normalizeInvoiceLineItems(lineItems, Boolean(showQuantity)),
    invoiceType,
    showQuantity,
    includeDueDate
  });

  const response = await fetch(createInvoiceWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(webhookSecret ? { 'x-webhook-secret': webhookSecret } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    const normalizedErrorText = errorText.trim() || 'No response body.';
    throw new HttpError(
      response.status >= 500 ? 502 : response.status,
      `Create invoice webhook failed (${response.status}): ${normalizedErrorText}`
    );
  }

  const responseText = await response.text();
  if (!responseText.trim()) {
    return {
      invoiceNo: null,
      status: 'accepted'
    };
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return JSON.parse(responseText);
  }

  return {
    invoiceNo: null,
    status: 'accepted',
    rawResponse: responseText
  };
}

function handleRoute(handler) {
  return async (request, response) => {
    try {
      await handler(request, response);
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      console.error(`[${request.method} ${request.originalUrl}]`, error);
      response.status(statusCode).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error.'
      });
    }
  };
}

export function createApp() {
  const app = express();
  const staticDir = getFrontendStaticDir();

  app.set('trust proxy', Number(getEnv('APP_TRUST_PROXY', '1')));

  app.use(express.json({ limit: '1mb' }));
  app.use('/assets', express.static(path.join(rootDir, 'assets')));
  app.get('/brand/cinqa-logo', (_request, response) => {
    response.sendFile(path.join(rootDir, 'Cinqa Logo.jpeg'));
  });
  if (staticDir) {
    app.use(express.static(staticDir));
  }

  app.get('/api/health', (_request, response) => {
    response.json(buildHealthPayload());
  });

  app.get('/api/auth/session', (request, response) => {
    const session = getAuthSession(request);
    response.json({
      ok: true,
      configured: isAppAuthConfigured(),
      authenticated: Boolean(session),
      username: session?.username || ''
    });
  });

  app.post(
    '/api/auth/login',
    handleRoute(async (request, response) => {
      if (!isAppAuthConfigured()) {
        throw new HttpError(503, 'App authentication is not configured.');
      }

      const username = validateTrimmedString(request.body.username, 'Username');
      const password = typeof request.body.password === 'string' ? request.body.password : '';
      const config = getAppAuthConfig();

      if (!config.username || !config.password) {
        throw new HttpError(503, 'App authentication is not configured.');
      }

      if (!constantTimeEqual(username, config.username) || !constantTimeEqual(password, config.password)) {
        throw new HttpError(401, 'Invalid username or password.');
      }

      setAuthSessionCookie(request, response, config.username);
      response.json({ ok: true, configured: true, authenticated: true, username: config.username });
    })
  );

  app.post('/api/auth/logout', (request, response) => {
    clearAuthSessionCookie(request, response);
    response.json({ ok: true, configured: isAppAuthConfigured(), authenticated: false, username: '' });
  });

  app.use('/api', requireAuthenticatedApp);

  app.get(
    '/api/clients',
    handleRoute(async (request, response) => {
      const search = validateOptionalString(request.query.search);
      const active = validateOptionalString(request.query.active) || 'all';
      response.json({ ok: true, clients: await queryClients({ search, active }) });
    })
  );

  app.post(
    '/api/clients',
    handleRoute(async (request, response) => {
      const client = await createClient(request.body || {});
      response.status(201).json({ ok: true, client });
    })
  );

  app.put(
    '/api/clients/:clientId',
    handleRoute(async (request, response) => {
      const client = await updateClient(request.params.clientId, request.body || {});
      response.json({ ok: true, client });
    })
  );

  app.get(
    '/api/invoices',
    handleRoute(async (request, response) => {
      const search = validateOptionalString(request.query.search);
      const status = validateOptionalString(request.query.status) || 'all';
      response.json({ ok: true, invoices: await listInvoices({ search, status }) });
    })
  );

  app.get(
    '/api/invoices/:invoiceId',
    handleRoute(async (request, response) => {
      response.json({ ok: true, invoice: await getInvoiceDetail(request.params.invoiceId) });
    })
  );

  app.patch(
    '/api/invoices/:invoiceId/status',
    handleRoute(async (request, response) => {
      const invoice = await updateInvoiceStatus(request.params.invoiceId, request.body.status);
      response.json({ ok: true, invoice });
    })
  );

  app.post(
    '/api/invoices',
    handleRoute(async (request, response) => {
      const clientId = validateTrimmedString(request.body.clientId, 'Client');
      const invoice = await createInvoiceFromClient({
        clientId,
        invoiceDate: request.body.invoiceDate,
        lineItems: request.body.lineItems,
        invoiceType: request.body.invoiceType,
        showQuantity: request.body.showQuantity,
        includeDueDate: request.body.includeDueDate
      });

      response.status(201).json({ ok: true, invoice });
    })
  );

  app.delete(
    '/api/invoices/:invoiceId',
    handleRoute(async (request, response) => {
      const deleted = await deleteInvoice(request.params.invoiceId);
      response.json({ ok: true, deleted });
    })
  );

  app.get('/', (_request, response) => {
    if (!staticDir) {
      response.status(503).json({
        ok: false,
        error: 'Frontend build not found. Run "npm run frontend:build" before serving the operator app.'
      });
      return;
    }

    response.sendFile(path.join(staticDir, 'index.html'));
  });

  app.get(/^(?!\/api\/).*/, (_request, response) => {
    if (!staticDir) {
      response.status(404).json({ ok: false, error: 'Frontend build not found.' });
      return;
    }

    response.sendFile(path.join(staticDir, 'index.html'));
  });

  return app;
}

export function startServer() {
  const app = createApp();
  const port = Number(getEnv('APP_PORT', '3010'));
  return app.listen(port, () => {
    console.log(`Cinqa Invoice Desk running on http://localhost:${port}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  startServer();
}