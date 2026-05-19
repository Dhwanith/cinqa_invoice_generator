import type { Account, BankBalance, BalanceSheetReport, CapitalEntry, JournalEntry, JournalLine, ProfitLossReport, TrialBalanceReport } from "@/types/accounting";
import { getAuthHeader } from "./api";

const BASE = "/api/accounting";

async function req<T>(url: string, options: RequestInit = {}): Promise<T> {
  const authHeader = await getAuthHeader();
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), ...(authHeader ? { Authorization: authHeader } : {}) },
  });
  const data = await response.json() as T & { ok: boolean; error?: string };
  if (response.status === 401) window.dispatchEvent(new CustomEvent("app-auth-expired"));
  if (!response.ok || (data as any).ok === false) throw new Error((data as any).error || "Request failed.");
  return data;
}

// Accounts
export async function fetchAccounts(): Promise<Account[]> {
  const data = await req<{ accounts: Account[] }>(`${BASE}/accounts`);
  return data.accounts;
}

// Journals
export async function fetchJournals(params?: { dateFrom?: string; dateTo?: string }): Promise<JournalEntry[]> {
  const q = new URLSearchParams();
  if (params?.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params?.dateTo)   q.set("dateTo",   params.dateTo);
  const data = await req<{ entries: JournalEntry[] }>(`${BASE}/journals${q.toString() ? `?${q}` : ""}`);
  return data.entries;
}

export async function createJournal(payload: { date: string; description: string; lines: Omit<JournalLine, "account">[] }): Promise<JournalEntry> {
  const data = await req<{ entry: JournalEntry }>(`${BASE}/journals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.entry;
}

export async function deleteJournal(id: string): Promise<void> {
  await req<{ ok: boolean }>(`${BASE}/journals/${id}`, { method: "DELETE" });
}

// Bank Balance
export async function fetchBankBalance(asOfDate?: string): Promise<BankBalance | null> {
  const q = asOfDate ? `?asOfDate=${asOfDate}` : "";
  const data = await req<{ bankBalance: BankBalance | null }>(`${BASE}/bank-balance${q}`);
  return data.bankBalance;
}

export async function saveBankBalance(payload: { date: string; balance: number; notes?: string }): Promise<BankBalance> {
  const data = await req<{ entry: BankBalance }>(`${BASE}/bank-balance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.entry;
}

// Capital
export async function fetchCapital(asOfDate?: string): Promise<CapitalEntry | null> {
  const q = asOfDate ? `?asOfDate=${asOfDate}` : "";
  const data = await req<{ capital: CapitalEntry | null }>(`${BASE}/capital${q}`);
  return data.capital;
}

export async function saveCapital(payload: { date: string; openingBalance: number; drawings: number; notes?: string }): Promise<CapitalEntry> {
  const data = await req<{ entry: CapitalEntry }>(`${BASE}/capital`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.entry;
}

// Reports
export async function fetchProfitLoss(dateFrom: string, dateTo: string): Promise<ProfitLossReport> {
  const data = await req<{ report: ProfitLossReport }>(`${BASE}/reports/profit-loss?dateFrom=${dateFrom}&dateTo=${dateTo}`);
  return data.report;
}

export async function fetchBalanceSheet(asOfDate: string): Promise<BalanceSheetReport> {
  const data = await req<{ report: BalanceSheetReport }>(`${BASE}/reports/balance-sheet?asOfDate=${asOfDate}`);
  return data.report;
}

export async function fetchTrialBalance(dateFrom: string, dateTo: string): Promise<TrialBalanceReport> {
  const data = await req<{ report: TrialBalanceReport }>(`${BASE}/reports/trial-balance?dateFrom=${dateFrom}&dateTo=${dateTo}`);
  return data.report;
}
