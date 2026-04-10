import test from 'node:test';
import assert from 'node:assert/strict';

import {
  amountToWords,
  buildInvoiceDocument,
  buildInvoiceNumber,
  calculateTaxBreakdown,
  getFinancialYearLabel
} from '../src/index.js';

test('financial year starts in april', () => {
  assert.equal(getFinancialYearLabel('2026-03-31'), '25-26');
  assert.equal(getFinancialYearLabel('2026-04-01'), '26-27');
});

test('invoice number format matches required convention', () => {
  assert.equal(buildInvoiceNumber({ date: '2026-04-04', sequence: 1 }), 'CTS/26-27/INV/001');
  assert.equal(buildInvoiceNumber({ date: '2026-04-04', sequence: 1, invoiceType: 'proforma' }), 'CTS/26-27/PI/001');
});

test('same-state tax splits into cgst and sgst', () => {
  assert.deepEqual(calculateTaxBreakdown({ amount: 300000, clientStateCode: 24, companyStateCode: 24 }), {
    gstType: 'CGST/SGST',
    taxableValue: 300000,
    cgst: 27000,
    sgst: 27000,
    igst: 0,
    total: 354000
  });
});

test('cross-state tax uses igst', () => {
  assert.deepEqual(calculateTaxBreakdown({ amount: 1000, clientStateCode: 27, companyStateCode: 24 }), {
    gstType: 'IGST',
    taxableValue: 1000,
    cgst: 0,
    sgst: 0,
    igst: 180,
    total: 1180
  });
});

test('amount in words uses indian numbering', () => {
  assert.equal(amountToWords(354000), 'Three Lakh Fifty-Four Thousand Rupees Only');
});

test('buildInvoiceDocument aggregates multiple line items', () => {
  const invoice = buildInvoiceDocument({
    idempotencyKey: 'req-1',
    invoiceDate: '2026-04-04',
    sequence: 7,
    client: {
      name: 'XYZ Pvt Ltd',
      gstin: '24ABCDE1234F1Z5',
      state: 'Gujarat',
      stateCode: 24,
      addressLines: ['Line 1']
    },
    lineItems: [
      { description: 'Service A', sac: '998314', amount: 100000 },
      { description: 'Service B', sac: '998315', amount: 50000 }
    ]
  });

  assert.equal(invoice.invoiceNo, 'CTS/26-27/INV/007');
  assert.equal(invoice.amount, 150000);
  assert.equal(invoice.cgst, 13500);
  assert.equal(invoice.sgst, 13500);
  assert.equal(invoice.igst, 0);
  assert.equal(invoice.total, 177000);
  assert.equal(invoice.sac, '998314, 998315');
});

test('buildInvoiceDocument uses proforma sequence format', () => {
  const invoice = buildInvoiceDocument({
    idempotencyKey: 'req-2',
    invoiceType: 'proforma',
    invoiceDate: '2026-04-04',
    sequence: 3,
    client: {
      name: 'XYZ Pvt Ltd',
      gstin: '24ABCDE1234F1Z5',
      state: 'Gujarat',
      stateCode: 24,
      addressLines: ['Line 1']
    },
    lineItems: [{ description: 'Service A', sac: '998314', amount: 100000 }]
  });

  assert.equal(invoice.invoiceNo, 'CTS/26-27/PI/003');
});