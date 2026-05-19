/**
 * GSTR-2B CSV parser.
 *
 * Handles the B2B section of the GSTR-2B download from the GST portal.
 * The portal exports an Excel file; users save the B2B sheet as CSV.
 *
 * Variations handled:
 *  - Preamble rows before the header (metadata like period, recipient GSTIN)
 *  - Column name variants across portal versions
 *  - Indian date format DD/MM/YYYY → YYYY-MM-DD
 *  - Numbers with comma separators (e.g. "1,00,000")
 *  - "NULL" text values → zero / empty string
 */

export interface ParsedGstr2bRecord {
  supplierGstin: string;
  supplierName: string;
  invoiceNo: string;
  invoiceType: string;
  invoiceDate: string;
  invoiceValue: number;
  placeOfSupply: string;
  reverseCharge: string;
  taxableAmount: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  itcAvailable: string;
  reason: string;
  filingPeriod: string;
}

export interface ParseResult {
  records: ParsedGstr2bRecord[];
  totalRows: number;
  skipped: number;
  errors: string[];
}

// ── Column name aliases ────────────────────────────────────────────────────

const COL: Record<string, string> = {
  'gstin of supplier':                       'supplierGstin',
  'gstin of the supplier':                   'supplierGstin',
  'trade/legal name':                        'supplierName',
  'trade/legal name of the supplier':        'supplierName',
  'trade name':                              'supplierName',
  'supplier name':                           'supplierName',
  'invoice number':                          'invoiceNo',
  'invoice no':                              'invoiceNo',
  'invoice no.':                             'invoiceNo',
  'invoice type':                            'invoiceType',
  'invoice date':                            'invoiceDate',
  'invoice value':                           'invoiceValue',
  'invoice value(₹)':                        'invoiceValue',
  'place of supply':                         'placeOfSupply',
  'reverse charge':                          'reverseCharge',
  'taxable value':                           'taxableAmount',
  'taxable value(₹)':                        'taxableAmount',
  'taxable amount':                          'taxableAmount',
  'integrated tax':                          'igst',
  'integrated tax(₹)':                       'igst',
  'igst':                                    'igst',
  'central tax':                             'cgst',
  'central tax(₹)':                          'cgst',
  'cgst':                                    'cgst',
  'state/ut tax':                            'sgst',
  'state/ut tax(₹)':                         'sgst',
  'sgst/utgst':                              'sgst',
  'sgst':                                    'sgst',
  'cess':                                    'cess',
  'cess(₹)':                                 'cess',
  'itc availability':                        'itcAvailable',
  'itc available':                           'itcAvailable',
  'reason':                                  'reason',
  'gstr-1 period':                           'filingPeriod',
  'gstr-1/iff period':                       'filingPeriod',
  'gstr-1/iff/gstr-5 period':                'filingPeriod',
  'gstr-1/iff/gstr-5 filing period':         'filingPeriod',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function parseNum(v: string): number {
  if (!v || v.trim().toUpperCase() === 'NULL' || v.trim() === '') return 0;
  return parseFloat(v.replace(/,/g, '')) || 0;
}

function parseIndianDate(v: string): string {
  if (!v || v.trim().toUpperCase() === 'NULL' || v.trim() === '') return '';
  const trimmed = v.trim();
  // DD/MM/YYYY or DD-MM-YYYY
  const m = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return '';
}

function parseStr(v: string): string {
  if (!v || v.trim().toUpperCase() === 'NULL') return '';
  return v.trim();
}

/** Parse a CSV line respecting quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ── Main parser ────────────────────────────────────────────────────────────

export function parseGstr2bCsv(csvText: string): ParseResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  let headerRowIndex = -1;
  let fieldMap: Record<number, string> = {};

  // Find the header row by scanning for a line that contains supplier GSTIN column
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cells = parseCSVLine(lines[i]).map((c) => c.toLowerCase().trim().replace(/₹/g, '').trim());
    const hasSupplierId = cells.some((c) => c.includes('gstin') && (c.includes('supplier') || i === 0));
    if (hasSupplierId) {
      headerRowIndex = i;
      cells.forEach((cell, colIdx) => {
        const mapped = COL[cell];
        if (mapped) fieldMap[colIdx] = mapped;
      });
      break;
    }
  }

  if (headerRowIndex === -1) {
    return {
      records: [],
      totalRows: 0,
      skipped: lines.length,
      errors: ['Could not find the header row. Make sure this is a GSTR-2B B2B CSV file from the GST portal.'],
    };
  }

  if (!Object.values(fieldMap).includes('supplierGstin')) {
    errors.push('Warning: supplierGstin column not found — check column names.');
  }

  const records: ParsedGstr2bRecord[] = [];
  let skipped = headerRowIndex + 1; // header + preamble

  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.every((c) => !c.trim())) { skipped++; continue; }

    const row: Record<string, string> = {};
    Object.entries(fieldMap).forEach(([colIdx, field]) => {
      row[field] = cells[parseInt(colIdx, 10)] ?? '';
    });

    const gstin = parseStr(row.supplierGstin);
    if (!gstin || !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) {
      skipped++;
      continue; // Skip rows without a valid GSTIN (totals, section headers)
    }

    records.push({
      supplierGstin: gstin,
      supplierName:  parseStr(row.supplierName),
      invoiceNo:     parseStr(row.invoiceNo),
      invoiceType:   parseStr(row.invoiceType) || 'Regular',
      invoiceDate:   parseIndianDate(row.invoiceDate),
      invoiceValue:  parseNum(row.invoiceValue),
      placeOfSupply: parseStr(row.placeOfSupply),
      reverseCharge: parseStr(row.reverseCharge) || 'N',
      taxableAmount: parseNum(row.taxableAmount),
      igst:          parseNum(row.igst),
      cgst:          parseNum(row.cgst),
      sgst:          parseNum(row.sgst),
      cess:          parseNum(row.cess),
      itcAvailable:  parseStr(row.itcAvailable) || 'Yes',
      reason:        parseStr(row.reason),
      filingPeriod:  parseStr(row.filingPeriod),
    });
  }

  return { records, totalRows: records.length + skipped - (headerRowIndex + 1), skipped, errors };
}
