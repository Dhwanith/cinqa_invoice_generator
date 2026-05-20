import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import express from 'express';

import { queryClients, getClientById, createClientRecord, updateClientRecord } from '../src/repositories/supabase/client-repository.js';
import { listInvoices, getInvoiceDetail, deleteInvoice, updateInvoiceStatus } from '../src/repositories/supabase/invoice-repository.js';
import { listVendors, getVendorById, createVendorRecord, updateVendorRecord } from '../src/repositories/supabase/vendor-repository.js';
import { listReimbursements, createReimbursement, updateReimbursementStatus, deleteReimbursement, bulkApproveReimbursements } from '../src/repositories/supabase/reimbursement-repository.js';
import { createGstr2bImport, listGstr2bImports, getGstr2bRecords, getBooksOnlyForImport, manualMatchRecord, computeGstr3bData, saveGstr3bReturn, markGstr3bFiled, listGstr3bReturns, getGstSummary } from '../src/repositories/supabase/gst-repository.js';
import { listAccounts, listJournalEntries, createJournalEntry, deleteJournalEntry, getLatestBankBalance, saveBankBalance, getLatestCapitalEntry, saveCapitalEntry, computeProfitLoss, computeBalanceSheet, computeTrialBalance } from '../src/repositories/supabase/accounting-repository.js';
import { listEmployees, createEmployee, updateEmployee, getSalaryStructure, upsertSalaryStructure, listPayrollRuns, getPayrollRun, getPayrollRunForPeriod, createPayrollRun, updatePayrollEntry, updatePayrollRunStatus, deletePayrollRun } from '../src/repositories/supabase/payroll-repository.js';
import { computeDashboardSummary } from '../src/repositories/supabase/dashboard-repository.js';
import { listPurchases, getPurchaseDetail, createPurchase, updatePurchaseStatus, markPurchasePaid, deletePurchase } from '../src/repositories/supabase/purchase-repository.js';
import { WorkflowError, resolveInvoiceClient, createInvoiceFromClient, convertProformaToTaxInvoice, buildInvoiceDocumentFromSnapshot, createInvoiceFromWebhookPayload } from '../src/services/invoice-workflow.js';
import { scheduleInvoicePdfGeneration } from '../src/services/pdf-background.js';
import { getSignedPdfUrl, deleteStoredPdf } from '../src/services/pdf-storage.js';
import { renderInvoicePdfBuffer } from '../src/services/pdf.js';
import { getSupabaseClient, getDefaultOrgId } from '../src/lib/supabase.js';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const rootDir = path.resolve(currentDir, '..');
const parentDir = path.dirname(rootDir);
const frontendDistDir = path.join(rootDir, 'frontend', 'dist');

dotenv.config({ path: path.join(rootDir, '.env'), quiet: true });
dotenv.config({ path: path.join(parentDir, '.env'), override: false, quiet: true });

const APP_SESSION_COOKIE_NAME = 'cinqa_operator_session';

// ── Config helpers ────────────────────────────────────────────────────────────

function getEnv(name, fallback = null) {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function hasEnv(name) {
  return Boolean(getEnv(name));
}

// ── Health builders ───────────────────────────────────────────────────────────

function getFrontendStaticDir() {
  return existsSync(frontendDistDir) ? frontendDistDir : null;
}

function buildHealthWarnings() {
  const warnings = [];
  if (!hasEnv('SUPABASE_URL')) warnings.push('SUPABASE_URL is missing.');
  if (!hasEnv('SUPABASE_SERVICE_ROLE_KEY')) warnings.push('SUPABASE_SERVICE_ROLE_KEY is missing.');
  if (!hasEnv('SUPABASE_ANON_KEY')) warnings.push('SUPABASE_ANON_KEY is missing — frontend auth will not work.');
  return warnings;
}

async function testSupabaseConnectivity() {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('organizations').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function buildHealthPayload() {
  const supabaseConnected = await testSupabaseConnectivity();
  return {
    ok: true,
    appName: 'Cinqa Invoice Desk',
    companyStateCode: Number(getEnv('COMPANY_STATE_CODE', '24')),
    defaultSac: getEnv('DEFAULT_SAC', '998314'),
    paymentTermsDays: Number(getEnv('PAYMENT_TERMS_DAYS', '10')),
    supabaseConfigured: hasEnv('SUPABASE_URL') && hasEnv('SUPABASE_SERVICE_ROLE_KEY'),
    supabaseConnected,
    authConfigured: hasEnv('SUPABASE_ANON_KEY'),
    config: {
      supabase: {
        hasUrl: hasEnv('SUPABASE_URL'),
        hasServiceKey: hasEnv('SUPABASE_SERVICE_ROLE_KEY'),
        hasAnonKey: hasEnv('SUPABASE_ANON_KEY'),
        orgId: getEnv('SUPABASE_DEFAULT_ORG_ID', '00000000-0000-0000-0000-000000000001')
      }
    },
    warnings: buildHealthWarnings()
  };
}

// ── Webhook rate limiter (in-memory, per IP) ──────────────────────────────────

const _webhookRateMap = new Map();
const WEBHOOK_WINDOW_MS = 60_000;
const WEBHOOK_MAX_PER_WINDOW = 30;

function webhookRateLimiter(request, response, next) {
  const ip = String(request.ip || request.socket?.remoteAddress || 'unknown');
  const now = Date.now();

  let entry = _webhookRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WEBHOOK_WINDOW_MS };
    _webhookRateMap.set(ip, entry);
  }

  entry.count++;

  if (entry.count > WEBHOOK_MAX_PER_WINDOW) {
    response.status(429).json({ ok: false, error: 'Too many requests. Please slow down.' });
    return;
  }

  next();
}

// Prune expired rate-limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of _webhookRateMap) {
    if (now > entry.resetAt) _webhookRateMap.delete(ip);
  }
}, 5 * 60_000);

// ── Error types ───────────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

// ── Session auth ──────────────────────────────────────────────────────────────

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
        const sep = part.indexOf('=');
        return sep === -1 ? [part, ''] : [part.slice(0, sep), decodeURIComponent(part.slice(sep + 1))];
      })
  );
}

function getAuthCookieValue(request) {
  return parseCookies(request.headers.cookie || '')[APP_SESSION_COOKIE_NAME] || null;
}

function createSessionSignature(payload) {
  const { sessionSecret } = getAppAuthConfig();
  if (!sessionSecret) throw new Error('APP_SESSION_SECRET is not configured.');
  return crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
}

function createAuthSessionToken(username) {
  const ttlHours = Number(getEnv('APP_SESSION_TTL_HOURS', '12'));
  const expiresAt = Date.now() + ttlHours * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ username, expiresAt }), 'utf8').toString('base64url');
  return `${payload}.${createSessionSignature(payload)}`;
}

function verifyAuthSessionToken(token) {
  if (!token || !token.includes('.')) return null;

  const [payload, providedSignature] = token.split('.');
  const expectedSignature = createSessionSignature(payload);
  const providedBuffer = Buffer.from(providedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session || typeof session.username !== 'string' || Number(session.expiresAt) <= Date.now()) return null;
    return { username: session.username, expiresAt: Number(session.expiresAt) };
  } catch {
    return null;
  }
}

function getAuthSession(request) {
  if (!isAppAuthConfigured()) return null;
  return verifyAuthSessionToken(getAuthCookieValue(request));
}

function isSecureCookieRequest(request) {
  const explicit = getEnv('APP_COOKIE_SECURE');
  if (explicit) return explicit.toLowerCase() === 'true';
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
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function requireAuthenticatedApp(request, response, next) {
  // ── Path 1: Supabase Auth JWT (Authorization: Bearer <token>) ─────────────
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const supabase = getSupabaseClient();
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user && !error) {
        request.authUser = { id: user.id, email: user.email };
        return next();
      }
    } catch {
      // Fall through to HMAC session
    }
  }

  // ── Path 2: Custom HMAC session cookie (backward-compat / operator access) ─
  if (isAppAuthConfigured()) {
    const session = getAuthSession(request);
    if (session) {
      request.authSession = session;
      return next();
    }
  }

  response.status(401).json({ ok: false, error: 'Authentication required.' });
}

// ── HTTP request validation ───────────────────────────────────────────────────

function validateTrimmedString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${fieldName} is required.`);
  }
  return value.trim();
}

function validateDateString(value, fieldName) {
  const normalized = validateTrimmedString(value, fieldName);
  if (Number.isNaN(new Date(normalized).getTime())) {
    throw new HttpError(400, `${fieldName} must be a valid date.`);
  }
  return normalized;
}

function validateOptionalString(value) {
  if (value === undefined || value === null) return '';
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

  if (!/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) throw new HttpError(400, 'GSTIN must be a valid 15-character GSTIN.');
  if (!Number.isInteger(stateCode) || stateCode <= 0) throw new HttpError(400, 'State Code must be a positive integer.');
  if (Number(gstin.slice(0, 2)) !== stateCode) throw new HttpError(400, 'GSTIN state code must match State Code.');

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

function validateInvoiceStatus(status) {
  const normalized = validateTrimmedString(status, 'Status').toLowerCase();
  const allowed = new Set(['generated', 'pending', 'sent', 'partially_paid', 'paid', 'cancelled']);
  if (!allowed.has(normalized)) {
    throw new HttpError(400, 'Status must be one of: generated, pending, sent, partially_paid, paid, cancelled.');
  }
  return normalized;
}

// ── Route handler wrapper ─────────────────────────────────────────────────────

function handleRoute(handler) {
  return async (request, response) => {
    try {
      await handler(request, response);
    } catch (error) {
      const hasStatusCode = error instanceof HttpError || error instanceof WorkflowError;
      const statusCode = hasStatusCode ? error.statusCode : 500;
      console.error(`[${request.method} ${request.originalUrl}]`, error);
      response.status(statusCode).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error.'
      });
    }
  };
}

// ── Express app ───────────────────────────────────────────────────────────────

export function createApp() {
  const app = express();
  const staticDir = getFrontendStaticDir();

  app.set('trust proxy', Number(getEnv('APP_TRUST_PROXY', '1')));

  // ── Security headers ───────────────────────────────────────────────────────
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use('/assets', express.static(path.join(rootDir, 'assets')));
  app.get('/brand/cinqa-logo', (_request, response) => {
    response.sendFile(path.join(rootDir, 'Cinqa Logo.jpeg'));
  });
  if (staticDir) app.use(express.static(staticDir));

  // ── Public routes ──────────────────────────────────────────────────────────

  app.get('/api/dashboard', handleRoute(async (request, response) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const fyStart = month >= 4 ? year : year - 1;
    const defaultFrom = `${fyStart}-04-01`;
    const defaultTo = now.toISOString().slice(0, 10);
    const dateFrom = validateOptionalString(request.query.dateFrom) || defaultFrom;
    const dateTo   = validateOptionalString(request.query.dateTo)   || defaultTo;
    response.json({ ok: true, summary: await computeDashboardSummary({ dateFrom, dateTo }) });
  }));

  app.get('/api/health', async (_request, response) => {
    response.json(await buildHealthPayload());
  });

  // Public: frontend reads this to initialise the Supabase client without build-time env vars
  app.get('/api/config', (_request, response) => {
    response.json({
      supabaseUrl: getEnv('SUPABASE_URL'),
      supabaseAnonKey: getEnv('SUPABASE_ANON_KEY')
    });
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
      if (!isAppAuthConfigured()) throw new HttpError(503, 'App authentication is not configured.');

      const username = validateTrimmedString(request.body.username, 'Username');
      const password = typeof request.body.password === 'string' ? request.body.password : '';
      const config = getAppAuthConfig();

      if (!config.username || !config.password) throw new HttpError(503, 'App authentication is not configured.');
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

  // ── Public webhook (API-key auth, no session required) ────────────────────
  // Drop-in replacement for the old n8n create-invoice webhook.
  // Accepts the same payload format that n8n used to receive.
  // Secure with WEBHOOK_API_KEY; leave unset for open (development only).

  app.post(
    '/webhook/create-invoice',
    webhookRateLimiter,
    handleRoute(async (request, response) => {
      const expectedKey = getEnv('WEBHOOK_API_KEY');
      if (expectedKey) {
        const provided = request.headers['x-webhook-secret'] || request.headers['x-api-key'];
        if (!provided || provided !== expectedKey) {
          throw new HttpError(401, 'Invalid or missing webhook API key.');
        }
      }

      if (!request.body || typeof request.body !== 'object') {
        throw new HttpError(400, 'Request body must be a JSON object.');
      }

      const result = await createInvoiceFromWebhookPayload(request.body);

      if (!result.duplicate) {
        scheduleInvoicePdfGeneration(result.invoiceRecordId, getDefaultOrgId());
      }

      response.status(result.duplicate ? 200 : 201).json({
        ok: true,
        duplicate: result.duplicate,
        invoiceNo: result.invoiceNo,
        invoiceRecordId: result.invoiceRecordId,
        total: result.total
      });
    })
  );

  // ── Protected routes ───────────────────────────────────────────────────────

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
      const client = validateClientPayload(request.body || {});
      const record = await createClientRecord(client);
      response.status(201).json({ ok: true, client: record });
    })
  );

  app.put(
    '/api/clients/:clientId',
    handleRoute(async (request, response) => {
      const client = validateClientPayload(request.body || {});
      const record = await updateClientRecord(request.params.clientId, client);
      response.json({ ok: true, client: record });
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
      // PostgreSQL CHECK constraint enforces the allowed values — no multi-candidate retry needed
      const status = validateInvoiceStatus(request.body.status);
      const invoice = await updateInvoiceStatus(request.params.invoiceId, status);
      response.json({ ok: true, invoice });
    })
  );

  app.post(
    '/api/invoices',
    handleRoute(async (request, response) => {
      const clientId = validateTrimmedString(request.body.clientId, 'Client');
      const invoiceDate = validateTrimmedString(request.body.invoiceDate, 'Invoice Date');
      const showQuantity = Boolean(request.body.showQuantity);
      const lineItems = normalizeInvoiceLineItems(request.body.lineItems, showQuantity);

      const invoice = await createInvoiceFromClient({
        clientId,
        invoiceDate,
        lineItems,
        invoiceType: request.body.invoiceType,
        showQuantity,
        includeDueDate: request.body.includeDueDate
      });

      // Trigger background PDF generation — does not block the response
      scheduleInvoicePdfGeneration(invoice.invoiceRecordId, getDefaultOrgId());

      response.status(201).json({ ok: true, invoice });
    })
  );

  app.post(
    '/api/invoices/:invoiceId/convert-to-tax',
    handleRoute(async (request, response) => {
      const invoice = await convertProformaToTaxInvoice({
        invoiceId: request.params.invoiceId,
        purchaseOrderNumber: validateTrimmedString(request.body.purchaseOrderNumber, 'Purchase Order No'),
        purchaseOrderDate: validateDateString(request.body.purchaseOrderDate, 'Purchase Order Date'),
        invoiceDate: validateOptionalString(request.body.invoiceDate) || null,
        sac: validateOptionalString(request.body.sac)
      });

      scheduleInvoicePdfGeneration(invoice.invoiceRecordId, getDefaultOrgId());
      response.status(201).json({ ok: true, invoice });
    })
  );

  app.delete(
    '/api/invoices/:invoiceId',
    handleRoute(async (request, response) => {
      const deleted = await deleteInvoice(request.params.invoiceId);

      // Best-effort: clean up Storage file if it was generated
      if (deleted.pdfStoragePath) {
        deleteStoredPdf(deleted.pdfStoragePath).catch((err) =>
          console.error(`[Delete] Failed to remove stored PDF ${deleted.pdfStoragePath}:`, err.message)
        );
      }

      // Don't expose internal storage path to the client
      const { pdfStoragePath: _omit, ...clientDeleted } = deleted;
      response.json({ ok: true, deleted: clientDeleted });
    })
  );

  app.get(
    '/api/invoices/:invoiceId/pdf-status',
    handleRoute(async (request, response) => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('invoices')
        .select('id, pdf_storage_path, pdf_generated_at')
        .eq('id', request.params.invoiceId)
        .single();

      if (error) throw new HttpError(404, 'Invoice not found.');

      response.json({
        ok: true,
        ready: Boolean(data.pdf_storage_path),
        pdfStoragePath: data.pdf_storage_path || null,
        generatedAt: data.pdf_generated_at || null
      });
    })
  );

  // Returns signed URL as JSON — lets the frontend fetch with auth header then open
  // the Supabase Storage URL directly (no auth header needed for Supabase signed URLs).
  app.get(
    '/api/invoices/:invoiceId/pdf-url',
    handleRoute(async (request, response) => {
      const invoiceRecord = await getInvoiceDetail(request.params.invoiceId);
      const filename = `${invoiceRecord.invoiceNo.replace(/\//g, '-')}.pdf`;

      if (invoiceRecord.pdfStoragePath) {
        const url = await getSignedPdfUrl(invoiceRecord.pdfStoragePath, 3600);
        return response.json({ ok: true, url, filename, source: 'storage' });
      }

      // On-demand fallback: render with Puppeteer, return as base64 data URI
      let clientRecord = null;
      try { clientRecord = await resolveInvoiceClient(invoiceRecord); } catch {}
      const invoice = buildInvoiceDocumentFromSnapshot(invoiceRecord, clientRecord);
      const pdfBuffer = await renderInvoicePdfBuffer(invoice);
      response.json({
        ok: true,
        url: `data:application/pdf;base64,${pdfBuffer.toString('base64')}`,
        filename,
        source: 'realtime'
      });
    })
  );

  app.get(
    '/api/invoices/:invoiceId/pdf',
    handleRoute(async (request, response) => {
      const invoiceRecord = await getInvoiceDetail(request.params.invoiceId);
      const isDownload = request.query.download === '1';

      // Fast path: PDF already stored — issue a signed URL redirect (instant)
      if (invoiceRecord.pdfStoragePath) {
        const ttl = isDownload ? 3600 : 86400;
        const signedUrl = await getSignedPdfUrl(invoiceRecord.pdfStoragePath, ttl);
        response.redirect(302, signedUrl);
        return;
      }

      // Fallback: render on demand with Puppeteer (PDF job pending or failed)
      let clientRecord = null;
      try {
        clientRecord = await resolveInvoiceClient(invoiceRecord);
      } catch {
        // Address lines will be omitted — PDF still renders
      }

      const invoice = buildInvoiceDocumentFromSnapshot(invoiceRecord, clientRecord);
      const pdfBuffer = await renderInvoicePdfBuffer(invoice);
      const filename = `${invoiceRecord.invoiceNo.replace(/\//g, '-')}.pdf`;

      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader('Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="${filename}"`);
      response.setHeader('Content-Length', pdfBuffer.length);
      response.send(pdfBuffer);
    })
  );

  // ── Vendors ───────────────────────────────────────────────────────────────

  app.get(
    '/api/vendors',
    handleRoute(async (request, response) => {
      const search = validateOptionalString(request.query.search);
      const active = validateOptionalString(request.query.active) || 'all';
      const category = validateOptionalString(request.query.category);
      response.json({ ok: true, vendors: await listVendors({ search, active, category }) });
    })
  );

  app.post(
    '/api/vendors',
    handleRoute(async (request, response) => {
      const body = request.body || {};
      const name = validateTrimmedString(body.name, 'Vendor Name');
      const gstin = validateOptionalString(body.gstin).toUpperCase() || null;
      if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) {
        throw new HttpError(400, 'GSTIN must be a valid 15-character GSTIN.');
      }
      const vendor = await createVendorRecord({
        name,
        gstin,
        state: validateOptionalString(body.state),
        stateCode: Number(body.stateCode || 0),
        addressLine1: validateOptionalString(body.addressLine1),
        addressLine2: validateOptionalString(body.addressLine2),
        addressLine3: validateOptionalString(body.addressLine3),
        category: validateOptionalString(body.category) || 'other',
        defaultPaymentTermsDays: Number(body.defaultPaymentTermsDays || 30),
        email: validateOptionalString(body.email),
        phone: validateOptionalString(body.phone),
        notes: validateOptionalString(body.notes),
        active: body.active === undefined ? true : Boolean(body.active)
      });
      response.status(201).json({ ok: true, vendor });
    })
  );

  app.put(
    '/api/vendors/:vendorId',
    handleRoute(async (request, response) => {
      const body = request.body || {};
      const name = validateTrimmedString(body.name, 'Vendor Name');
      const gstin = validateOptionalString(body.gstin).toUpperCase() || null;
      if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) {
        throw new HttpError(400, 'GSTIN must be a valid 15-character GSTIN.');
      }
      const vendor = await updateVendorRecord(request.params.vendorId, {
        name,
        gstin,
        state: validateOptionalString(body.state),
        stateCode: Number(body.stateCode || 0),
        addressLine1: validateOptionalString(body.addressLine1),
        addressLine2: validateOptionalString(body.addressLine2),
        addressLine3: validateOptionalString(body.addressLine3),
        category: validateOptionalString(body.category) || 'other',
        defaultPaymentTermsDays: Number(body.defaultPaymentTermsDays || 30),
        email: validateOptionalString(body.email),
        phone: validateOptionalString(body.phone),
        notes: validateOptionalString(body.notes),
        active: body.active === undefined ? true : Boolean(body.active)
      });
      response.json({ ok: true, vendor });
    })
  );

  // ── Purchases ─────────────────────────────────────────────────────────────

  app.get(
    '/api/purchases',
    handleRoute(async (request, response) => {
      const search = validateOptionalString(request.query.search);
      const status = validateOptionalString(request.query.status) || 'all';
      const dateFrom = validateOptionalString(request.query.dateFrom);
      const dateTo = validateOptionalString(request.query.dateTo);
      response.json({ ok: true, purchases: await listPurchases({ search, status, dateFrom, dateTo }) });
    })
  );

  app.get(
    '/api/purchases/:purchaseId',
    handleRoute(async (request, response) => {
      response.json({ ok: true, purchase: await getPurchaseDetail(request.params.purchaseId) });
    })
  );

  app.post(
    '/api/purchases',
    handleRoute(async (request, response) => {
      const body = request.body || {};
      const vendorId = validateTrimmedString(body.vendorId, 'Vendor');
      const purchaseDate = validateDateString(body.purchaseDate, 'Purchase Date');
      if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
        throw new HttpError(400, 'At least one line item is required.');
      }
      const purchase = await createPurchase({
        vendorId,
        purchaseDate,
        dueDate: validateOptionalString(body.dueDate) || null,
        purchaseNumber: validateOptionalString(body.purchaseNumber),
        category: validateOptionalString(body.category) || 'other',
        itcType: validateOptionalString(body.itcType) || 'full',
        isRcm: Boolean(body.isRcm),
        notes: validateOptionalString(body.notes),
        lineItems: body.lineItems
      });
      response.status(201).json({ ok: true, purchase });
    })
  );

  app.patch(
    '/api/purchases/:purchaseId/status',
    handleRoute(async (request, response) => {
      const status = validateTrimmedString(request.body.status, 'Status').toLowerCase();
      const allowed = new Set(['draft', 'booked', 'paid', 'cancelled']);
      if (!allowed.has(status)) throw new HttpError(400, 'Status must be one of: draft, booked, paid, cancelled.');

      if (status === 'paid') {
        const purchase = await markPurchasePaid(request.params.purchaseId, {
          paymentDate: validateOptionalString(request.body.paymentDate) || new Date().toISOString().slice(0, 10),
          paymentReference: validateOptionalString(request.body.paymentReference)
        });
        return response.json({ ok: true, purchase });
      }

      const purchase = await updatePurchaseStatus(request.params.purchaseId, status);
      response.json({ ok: true, purchase });
    })
  );

  app.delete(
    '/api/purchases/:purchaseId',
    handleRoute(async (request, response) => {
      const deleted = await deletePurchase(request.params.purchaseId);
      response.json({ ok: true, deleted });
    })
  );

  // ── Reimbursements ────────────────────────────────────────────────────────

  app.get(
    '/api/reimbursements',
    handleRoute(async (request, response) => {
      response.json({ ok: true, reimbursements: await listReimbursements({
        search:   validateOptionalString(request.query.search),
        status:   validateOptionalString(request.query.status) || 'all',
        paidBy:   validateOptionalString(request.query.paidBy),
        dateFrom: validateOptionalString(request.query.dateFrom),
        dateTo:   validateOptionalString(request.query.dateTo)
      })});
    })
  );

  app.post(
    '/api/reimbursements',
    handleRoute(async (request, response) => {
      const body = request.body || {};
      const reimbursement = await createReimbursement({
        paidBy:           validateTrimmedString(body.paidBy, 'Paid By'),
        date:             validateDateString(body.date, 'Date'),
        description:      validateTrimmedString(body.description, 'Description'),
        category:         validateOptionalString(body.category) || 'other',
        amount:           Number(body.amount || 0),
        gstAmount:        Number(body.gstAmount || 0),
        itcEligible:      Boolean(body.itcEligible),
        receiptReference: validateOptionalString(body.receiptReference),
        notes:            validateOptionalString(body.notes)
      });
      response.status(201).json({ ok: true, reimbursement });
    })
  );

  app.patch(
    '/api/reimbursements/:id/status',
    handleRoute(async (request, response) => {
      const body = request.body || {};
      const status = validateTrimmedString(body.status, 'Status').toLowerCase();
      const allowed = new Set(['approved', 'reimbursed', 'rejected', 'pending']);
      if (!allowed.has(status)) throw new HttpError(400, 'Invalid status.');
      const reimbursement = await updateReimbursementStatus(request.params.id, {
        status,
        reimbursedDate:   validateOptionalString(body.reimbursedDate),
        reimbursedAmount: body.reimbursedAmount !== undefined ? Number(body.reimbursedAmount) : undefined,
        paymentReference: validateOptionalString(body.paymentReference)
      });
      response.json({ ok: true, reimbursement });
    })
  );

  app.post(
    '/api/reimbursements/bulk-approve',
    handleRoute(async (request, response) => {
      const ids = request.body?.ids;
      if (!Array.isArray(ids) || ids.length === 0) throw new HttpError(400, 'ids must be a non-empty array.');
      const approved = await bulkApproveReimbursements(ids);
      response.json({ ok: true, approved, count: approved.length });
    })
  );

  app.delete(
    '/api/reimbursements/:id',
    handleRoute(async (request, response) => {
      const deleted = await deleteReimbursement(request.params.id);
      response.json({ ok: true, deleted });
    })
  );

  // ── GST — GSTR-2B ─────────────────────────────────────────────────────────

  app.get('/api/gst/gstr2b/imports', handleRoute(async (_request, response) => {
    response.json({ ok: true, imports: await listGstr2bImports() });
  }));

  app.post('/api/gst/gstr2b/import', handleRoute(async (request, response) => {
    const body = request.body || {};
    if (!Array.isArray(body.records) || body.records.length === 0) {
      throw new HttpError(400, 'records must be a non-empty array.');
    }
    const importRun = await createGstr2bImport({
      financialYear: validateTrimmedString(body.financialYear, 'financialYear'),
      month: Number(body.month),
      periodLabel: validateTrimmedString(body.periodLabel, 'periodLabel'),
      filename: validateOptionalString(body.filename),
      records: body.records,
    });
    response.status(201).json({ ok: true, import: importRun });
  }));

  app.get('/api/gst/gstr2b/:importId/records', handleRoute(async (request, response) => {
    response.json({ ok: true, records: await getGstr2bRecords(request.params.importId) });
  }));

  app.get('/api/gst/gstr2b/:importId/books-only', handleRoute(async (request, response) => {
    response.json({ ok: true, purchases: await getBooksOnlyForImport(request.params.importId) });
  }));

  app.patch('/api/gst/gstr2b/records/:recordId/match', handleRoute(async (request, response) => {
    const purchaseId = validateTrimmedString(request.body.purchaseId, 'purchaseId');
    const record = await manualMatchRecord(request.params.recordId, purchaseId);
    response.json({ ok: true, record });
  }));

  // ── GST — GSTR-3B ─────────────────────────────────────────────────────────

  app.get('/api/gst/gstr3b', handleRoute(async (_request, response) => {
    response.json({ ok: true, returns: await listGstr3bReturns() });
  }));

  app.post('/api/gst/gstr3b/compute', handleRoute(async (request, response) => {
    const financialYear = validateTrimmedString(request.body.financialYear, 'financialYear');
    const month = Number(request.body.month);
    if (!month || month < 1 || month > 12) throw new HttpError(400, 'month must be 1–12.');
    const computed = await computeGstr3bData(financialYear, month);
    response.json({ ok: true, computed });
  }));

  app.post('/api/gst/gstr3b/save', handleRoute(async (request, response) => {
    const body = request.body || {};
    const data = await saveGstr3bReturn({
      financialYear: validateTrimmedString(body.financialYear, 'financialYear'),
      month: Number(body.month),
      periodLabel: validateTrimmedString(body.periodLabel, 'periodLabel'),
      computed: body.computed,
      manualAdjustments: body.manualAdjustments || null,
      notes: validateOptionalString(body.notes),
    });
    response.json({ ok: true, return: data });
  }));

  app.patch('/api/gst/gstr3b/:id/file', handleRoute(async (request, response) => {
    const data = await markGstr3bFiled(request.params.id, {
      filedDate: validateDateString(request.body.filedDate, 'filedDate'),
      filedReference: validateOptionalString(request.body.filedReference),
    });
    response.json({ ok: true, return: data });
  }));

  // ── GST — Summary ──────────────────────────────────────────────────────────

  app.get('/api/gst/summary', handleRoute(async (request, response) => {
    const fy = validateOptionalString(request.query.financialYear) || '26-27';
    response.json({ ok: true, ...(await getGstSummary(fy)) });
  }));

  // ── Accounting — Chart of Accounts ───────────────────────────────────────

  app.get('/api/accounting/accounts', handleRoute(async (_req, res) => {
    res.json({ ok: true, accounts: await listAccounts() });
  }));

  // ── Accounting — Journal Entries ──────────────────────────────────────────

  app.get('/api/accounting/journals', handleRoute(async (req, res) => {
    const dateFrom = validateOptionalString(req.query.dateFrom);
    const dateTo   = validateOptionalString(req.query.dateTo);
    res.json({ ok: true, entries: await listJournalEntries({ dateFrom, dateTo }) });
  }));

  app.post('/api/accounting/journals', handleRoute(async (req, res) => {
    const body = req.body || {};
    const entry = await createJournalEntry({
      date: validateDateString(body.date, 'Date'),
      description: validateTrimmedString(body.description, 'Description'),
      lines: Array.isArray(body.lines) ? body.lines : [],
    });
    res.status(201).json({ ok: true, entry });
  }));

  app.delete('/api/accounting/journals/:id', handleRoute(async (req, res) => {
    await deleteJournalEntry(req.params.id);
    res.json({ ok: true });
  }));

  // ── Accounting — Bank Balance ──────────────────────────────────────────────

  app.get('/api/accounting/bank-balance', handleRoute(async (req, res) => {
    const asOfDate = validateOptionalString(req.query.asOfDate);
    res.json({ ok: true, bankBalance: await getLatestBankBalance(asOfDate || null) });
  }));

  app.post('/api/accounting/bank-balance', handleRoute(async (req, res) => {
    const body = req.body || {};
    const entry = await saveBankBalance({
      date: validateDateString(body.date, 'Date'),
      balance: Number(body.balance || 0),
      notes: validateOptionalString(body.notes),
    });
    res.status(201).json({ ok: true, entry });
  }));

  // ── Accounting — Capital Entries ──────────────────────────────────────────

  app.get('/api/accounting/capital', handleRoute(async (req, res) => {
    const asOfDate = validateOptionalString(req.query.asOfDate);
    res.json({ ok: true, capital: await getLatestCapitalEntry(asOfDate || null) });
  }));

  app.post('/api/accounting/capital', handleRoute(async (req, res) => {
    const body = req.body || {};
    const entry = await saveCapitalEntry({
      date: validateDateString(body.date, 'Date'),
      openingBalance: Number(body.openingBalance || 0),
      drawings: Number(body.drawings || 0),
      notes: validateOptionalString(body.notes),
    });
    res.status(201).json({ ok: true, entry });
  }));

  // ── Accounting — Reports ──────────────────────────────────────────────────

  app.get('/api/accounting/reports/profit-loss', handleRoute(async (req, res) => {
    const dateFrom = validateTrimmedString(req.query.dateFrom, 'dateFrom');
    const dateTo   = validateTrimmedString(req.query.dateTo,   'dateTo');
    res.json({ ok: true, report: await computeProfitLoss({ dateFrom, dateTo }) });
  }));

  app.get('/api/accounting/reports/balance-sheet', handleRoute(async (req, res) => {
    const asOfDate = validateTrimmedString(req.query.asOfDate, 'asOfDate');
    res.json({ ok: true, report: await computeBalanceSheet({ asOfDate }) });
  }));

  app.get('/api/accounting/reports/trial-balance', handleRoute(async (req, res) => {
    const dateFrom = validateTrimmedString(req.query.dateFrom, 'dateFrom');
    const dateTo   = validateTrimmedString(req.query.dateTo,   'dateTo');
    res.json({ ok: true, report: await computeTrialBalance({ dateFrom, dateTo }) });
  }));

  // ── Payroll — Employees ────────────────────────────────────────────────────

  app.get('/api/payroll/employees', handleRoute(async (req, res) => {
    res.json({ ok: true, employees: await listEmployees({ search: validateOptionalString(req.query.search), active: validateOptionalString(req.query.active) || 'all' }) });
  }));

  app.post('/api/payroll/employees', handleRoute(async (req, res) => {
    const emp = await createEmployee(req.body || {});
    res.status(201).json({ ok: true, employee: emp });
  }));

  app.put('/api/payroll/employees/:id', handleRoute(async (req, res) => {
    const emp = await updateEmployee(req.params.id, req.body || {});
    res.json({ ok: true, employee: emp });
  }));

  app.get('/api/payroll/employees/:id/salary', handleRoute(async (req, res) => {
    res.json({ ok: true, structure: await getSalaryStructure(req.params.id) });
  }));

  app.put('/api/payroll/employees/:id/salary', handleRoute(async (req, res) => {
    const struct = await upsertSalaryStructure(req.params.id, req.body || {});
    res.json({ ok: true, structure: struct });
  }));

  // ── Payroll — Runs ─────────────────────────────────────────────────────────

  app.get('/api/payroll/runs', handleRoute(async (_req, res) => {
    res.json({ ok: true, runs: await listPayrollRuns() });
  }));

  app.get('/api/payroll/runs/period', handleRoute(async (req, res) => {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!month || !year) throw new HttpError(400, 'month and year are required.');
    res.json({ ok: true, run: await getPayrollRunForPeriod(month, year) });
  }));

  app.get('/api/payroll/runs/:runId', handleRoute(async (req, res) => {
    res.json({ ok: true, run: await getPayrollRun(req.params.runId) });
  }));

  app.post('/api/payroll/runs', handleRoute(async (req, res) => {
    const body = req.body || {};
    const run = await createPayrollRun({
      month: Number(body.month), year: Number(body.year),
      periodLabel: validateTrimmedString(body.periodLabel, 'periodLabel'),
      financialYear: validateOptionalString(body.financialYear),
      workingDays: Number(body.workingDays || 26),
    });
    res.status(201).json({ ok: true, run });
  }));

  app.patch('/api/payroll/runs/:runId/status', handleRoute(async (req, res) => {
    const status = validateTrimmedString(req.body.status, 'status').toLowerCase();
    if (!['approved', 'paid', 'draft'].includes(status)) throw new HttpError(400, 'Invalid status.');
    const run = await updatePayrollRunStatus(req.params.runId, status);
    res.json({ ok: true, run });
  }));

  app.delete('/api/payroll/runs/:runId', handleRoute(async (req, res) => {
    await deletePayrollRun(req.params.runId);
    res.json({ ok: true });
  }));

  app.patch('/api/payroll/entries/:entryId', handleRoute(async (req, res) => {
    const body = req.body || {};
    await updatePayrollEntry(req.params.entryId, {
      presentDays: body.presentDays !== undefined ? Number(body.presentDays) : undefined,
      bonus: body.bonus !== undefined ? Number(body.bonus) : undefined,
      otherDeductions: body.otherDeductions !== undefined ? Number(body.otherDeductions) : undefined,
    });
    res.json({ ok: true });
  }));

  // ── SPA fallback ───────────────────────────────────────────────────────────

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
  const server = app.listen(port, () => {
    console.log(`Cinqa Invoice Desk running on http://localhost:${port}`);
  });

  const shutdown = (signal) => {
    console.log(`[${signal}] Shutting down gracefully...`);
    server.close(() => {
      console.log('[Server] All connections closed.');
      process.exit(0);
    });
    // Force exit after 30 s if connections hang
    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout.');
      process.exit(1);
    }, 30_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  startServer();
}
