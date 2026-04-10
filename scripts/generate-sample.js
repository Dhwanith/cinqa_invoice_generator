import fs from 'node:fs/promises';
import path from 'node:path';
import { buildInvoiceDocument, renderInvoiceHtml, writeInvoicePdf } from '../src/index.js';

const sampleRequest = {
  idempotencyKey: 'req-2026-04-04-001',
  invoiceDate: '2026-04-04',
  sequence: 1,
  client: {
    name: 'AdKrity Digital Solutions Private Limited',
    gstin: '24AAVCA3793L1ZY',
    state: 'Gujarat',
    stateCode: 24,
    addressLines: [
      '28 29, C K Park, Adajan, Honey Park Road,',
      'Rander, Surat - 395009, GJ(24)'
    ]
  },
  lineItems: [
    {
      description: 'AI-based Marketing Image Generation Services (Partial Payment - Phase 1 of Project)',
      sac: '998314',
      amount: 300000
    }
  ]
};

const invoice = buildInvoiceDocument(sampleRequest);
const html = renderInvoiceHtml(invoice);
const outputDir = path.resolve('output');

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'sample-invoice.html'), html, 'utf8');
await writeInvoicePdf(invoice, path.join(outputDir, 'sample-invoice.pdf'));

console.log(`Generated ${path.join(outputDir, 'sample-invoice.html')}`);
console.log(`Generated ${path.join(outputDir, 'sample-invoice.pdf')}`);