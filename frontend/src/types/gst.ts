export type ReconciliationStatus = 'matched' | 'amount_mismatch' | 'unmatched' | 'manually_matched';

export interface Gstr2bImport {
  id: string;
  financialYear: string;
  month: number;
  periodLabel: string;
  filename: string;
  status: string;
  totalRecords: number;
  matchedRecords: number;
  totalItcIgst: number;
  totalItcCgst: number;
  totalItcSgst: number;
  createdAt: string;
}

export interface Gstr2bRecord {
  id: string;
  importId: string;
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
  filingPeriod: string;
  reconciliationStatus: ReconciliationStatus;
  matchedPurchaseId: string | null;
}

export interface GstTaxBlock { igst: number; cgst: number; sgst: number; }

export interface Gstr3bComputed {
  period: { financialYear: string; month: number; from: string; to: string };
  outward:       GstTaxBlock & { taxableValue: number };
  rcm:           GstTaxBlock & { taxableValue: number };
  itcAvailable:  GstTaxBlock;
  itcReversed:   GstTaxBlock;
  netItc:        GstTaxBlock;
  netPayable:    GstTaxBlock;
  reimbursementItc: number;
  invoiceCount:  number;
  purchaseCount: number;
}

export interface Gstr3bReturn {
  id: string;
  financialYear: string;
  month: number;
  periodLabel: string;
  status: 'draft' | 'saved' | 'filed';
  outwardTaxableValue: number;
  outwardIgst: number; outwardCgst: number; outwardSgst: number;
  rcmTaxableValue: number;
  rcmIgst: number; rcmCgst: number; rcmSgst: number;
  itcIgst: number; itcCgst: number; itcSgst: number;
  itcReversedIgst: number; itcReversedCgst: number; itcReversedSgst: number;
  netItcIgst: number; netItcCgst: number; netItcSgst: number;
  netIgstPayable: number; netCgstPayable: number; netSgstPayable: number;
  filedDate: string;
  filedReference: string;
  notes: string;
}

export const MONTHS = [
  { value: 4,  label: 'April'     },
  { value: 5,  label: 'May'       },
  { value: 6,  label: 'June'      },
  { value: 7,  label: 'July'      },
  { value: 8,  label: 'August'    },
  { value: 9,  label: 'September' },
  { value: 10, label: 'October'   },
  { value: 11, label: 'November'  },
  { value: 12, label: 'December'  },
  { value: 1,  label: 'January'   },
  { value: 2,  label: 'February'  },
  { value: 3,  label: 'March'     },
];

export function periodLabel(financialYear: string, month: number): string {
  const monthName = MONTHS.find((m) => m.value === month)?.label ?? '';
  const [fyStart] = financialYear.split('-').map((y) => 2000 + parseInt(y, 10));
  const calYear = month >= 4 ? fyStart : fyStart + 1;
  return `${monthName} ${calYear}`;
}

export function currentFinancialYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}
