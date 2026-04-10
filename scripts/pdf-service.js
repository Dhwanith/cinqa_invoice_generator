import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import express from 'express';

import { buildInvoiceDocument, renderInvoiceHtml, renderInvoicePdfBuffer } from '../src/index.js';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const rootDir = path.resolve(currentDir, '..');
const parentDir = path.dirname(rootDir);

dotenv.config({ path: path.join(rootDir, '.env'), quiet: true });
dotenv.config({ path: path.join(parentDir, '.env'), override: false, quiet: true });

const app = express();
const port = Number(process.env.PDF_SERVICE_PORT || '3001');

app.use(express.json({ limit: '2mb' }));

app.get('/health', (_request, response) => {
  response.json({ ok: true });
});

app.post('/render-invoice-html', async (request, response) => {
  try {
    const invoice = request.body.invoice ?? buildInvoiceDocument(request.body.payload, request.body.overrides || {});
    const html = renderInvoiceHtml(invoice);
    response.json({ ok: true, html });
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/render-invoice-pdf', async (request, response) => {
  try {
    const invoice = request.body.invoice ?? buildInvoiceDocument(request.body.payload, request.body.overrides || {});
    const buffer = await renderInvoicePdfBuffer(invoice);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `inline; filename="${invoice.invoiceNo}.pdf"`);
    response.send(buffer);
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`PDF service listening on port ${port}`);
});