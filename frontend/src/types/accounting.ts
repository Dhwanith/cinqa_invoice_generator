export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subType: string;
  description: string;
  active: boolean;
  isSystem: boolean;
  sortOrder: number;
}

export interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
  account?: Account;
}

export interface JournalEntry {
  id: string;
  entryNo: string;
  date: string;
  description: string;
  entryType: 'manual' | 'auto';
  journalLines: JournalLine[];
  createdAt: string;
}

export interface BankBalance {
  id: string;
  date: string;
  balance: number;
  notes: string;
}

export interface CapitalEntry {
  id: string;
  date: string;
  openingBalance: number;
  drawings: number;
  notes: string;
}

export interface ProfitLossReport {
  period: { dateFrom: string; dateTo: string };
  invoiceCount: number;
  revenue: number;
  otherIncome: Record<string, number> | null;
  totalRevenue: number;
  outputGst: { cgst: number; sgst: number; igst: number; total: number };
  expenses: Record<string, number>;
  totalExpenses: number;
  grossProfit: number;
  ebitda: number;
  netProfit: number;
}

export interface BalanceSheetReport {
  asOfDate: string;
  assets: {
    bankBalance: number;
    bankDate: string | null;
    accountsReceivable: number;
    itcCgst: number; itcSgst: number; itcIgst: number; itcTotal: number;
    totalCurrentAssets: number;
    totalAssets: number;
  };
  liabilities: {
    accountsPayable: number;
    gstPayable: number | null;
    gstLabel: string | null;
    reimbursementsPayable: number;
    totalLiabilities: number;
  };
  capital: { openingCapital: number; drawings: number; plugCapital: number };
  bankRowId: string | null;
  capitalRowId: string | null;
}

export interface TrialBalanceLine {
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
}

export interface TrialBalanceReport {
  period: { dateFrom: string; dateTo: string };
  lines: TrialBalanceLine[];
  totalDebit: number;
  totalCredit: number;
  difference: number;
  balanced: boolean;
}

export function currentFyDateRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const fyStart = month >= 4 ? year : year - 1;
  return {
    dateFrom: `${fyStart}-04-01`,
    dateTo: now.toISOString().slice(0, 10),
  };
}
