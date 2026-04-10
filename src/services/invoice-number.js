import { getFinancialYearLabel } from './financial-year.js';

export function getInvoiceNumberCode(invoiceType = 'tax') {
  return invoiceType === 'proforma' ? 'PI' : 'INV';
}

export function formatInvoiceSequence(sequence) {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error('Invoice sequence must be a positive integer.');
  }

  return String(sequence).padStart(3, '0');
}

export function buildInvoiceNumber({ date, sequence, prefix = 'CTS', invoiceType = 'tax' }) {
  const financialYear = getFinancialYearLabel(date);
  return `${prefix}/${financialYear}/${getInvoiceNumberCode(invoiceType)}/${formatInvoiceSequence(sequence)}`;
}