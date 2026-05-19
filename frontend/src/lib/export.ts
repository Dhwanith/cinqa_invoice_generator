/**
 * Client-side CSV export and print utilities.
 * No external dependencies — uses native browser APIs only.
 */

type CellValue = string | number | boolean | null | undefined;

function escapeCell(value: CellValue): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Quote if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCsv(filename: string, headers: string[], rows: CellValue[][]): void {
  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ];
  const bom = '﻿'; // BOM for Excel UTF-8 detection
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function printElement(elementId: string): void {
  const el = document.getElementById(elementId);
  if (!el) return;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(`
    <!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <style>
      body { font-family: 'Arial', sans-serif; font-size: 11px; color: #111; margin: 20px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
      th { background: #f5f5f5; font-weight: bold; }
      .text-right { text-align: right; }
      h1, h2, h3 { margin: 0 0 8px; }
      .no-print { display: none; }
      @media print { body { margin: 10px; } }
    </style>
    </head><body>${el.innerHTML}</body></html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
}

// ── Per-module CSV schemas ────────────────────────────────────────────────────

export const INVOICE_CSV_HEADERS = [
  'Invoice No', 'Invoice Date', 'Due Date', 'Invoice Type', 'Client Name', 'GSTIN',
  'Taxable Amount', 'CGST', 'SGST', 'IGST', 'Total', 'Status',
];

export function invoiceToRow(inv: Record<string, any>): CellValue[] {
  return [
    inv.invoiceNo, inv.invoiceDate, inv.dueDate, inv.invoiceType,
    inv.clientName, inv.gstin,
    inv.amount, inv.cgst, inv.sgst, inv.igst, inv.total, inv.status,
  ];
}

export const PURCHASE_CSV_HEADERS = [
  'Purchase No', 'Purchase Date', 'Due Date', 'Vendor Name', 'Vendor GSTIN',
  'Category', 'Taxable Amount', 'CGST', 'SGST', 'IGST', 'Total',
  'ITC Eligible', 'ITC Type', 'Status',
];

export function purchaseToRow(p: Record<string, any>): CellValue[] {
  return [
    p.purchaseNumber, p.purchaseDate, p.dueDate, p.vendorName, p.vendorGstin,
    p.category, p.amount, p.cgst, p.sgst, p.igst, p.total,
    p.itcEligible ? 'Yes' : 'No', p.itcType, p.status,
  ];
}

export const REIMBURSEMENT_CSV_HEADERS = [
  'Date', 'Paid By', 'Description', 'Category', 'Amount', 'GST Amount',
  'ITC Eligible', 'Receipt Reference', 'Status', 'Reimbursed Date', 'Payment Ref',
];

export function reimbursementToRow(r: Record<string, any>): CellValue[] {
  return [
    r.date, r.paidBy, r.description, r.category, r.amount, r.gstAmount,
    r.itcEligible ? 'Yes' : 'No', r.receiptReference, r.status,
    r.reimbursedDate || '', r.paymentReference || '',
  ];
}

export const PAYROLL_CSV_HEADERS = [
  'Employee Code', 'Name', 'Designation', 'Type',
  'Working Days', 'Present Days', 'LOP Days',
  'Basic', 'HRA', 'Special Allowance', 'Other Allowances', 'Bonus', 'Gross Salary',
  'PF Employee', 'ESI Employee', 'TDS', 'Other Deductions', 'Total Deductions', 'Net Salary',
  'Payment Status', 'Payment Date', 'Payment Reference',
];

export function payrollEntryToRow(e: Record<string, any>): CellValue[] {
  const emp = e.employee || {};
  return [
    emp.employeeCode || '', emp.name || '', emp.designation || '', emp.employeeType || '',
    e.workingDays, e.presentDays, e.lopDays,
    e.basic, e.hra, e.specialAllowance, e.otherAllowances, e.bonus, e.grossSalary,
    e.pfEmployee, e.esiEmployee, e.tds, e.otherDeductions, e.totalDeductions, e.netSalary,
    e.paymentStatus, e.paymentDate || '', e.paymentReference || '',
  ];
}

export const TRIAL_BALANCE_CSV_HEADERS = ['Code', 'Account Name', 'Type', 'Debit', 'Credit', 'Balance'];

export function trialBalanceLineToRow(l: Record<string, any>): CellValue[] {
  return [l.code, l.name, l.type, l.debit, l.credit, l.debit - l.credit];
}
