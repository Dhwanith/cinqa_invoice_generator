import type { Gstr2bImport, Gstr2bRecord, Gstr3bComputed, Gstr3bReturn } from "@/types/gst";
import type { ParsedGstr2bRecord } from "@/lib/gstr2b-parser";
import type { Purchase } from "@/types/purchase";
import { getAuthHeader } from "./api";

const API_BASE = "/api/gst";

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

// ── GSTR-2B ──────────────────────────────────────────────────────────────────

export async function importGstr2b(payload: {
  financialYear: string; month: number; periodLabel: string;
  filename: string; records: ParsedGstr2bRecord[];
}): Promise<Gstr2bImport> {
  const data = await req<{ import: Gstr2bImport }>(`${API_BASE}/gstr2b/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.import;
}

export async function fetchGstr2bImports(): Promise<Gstr2bImport[]> {
  const data = await req<{ imports: Gstr2bImport[] }>(`${API_BASE}/gstr2b/imports`);
  return data.imports;
}

export async function fetchGstr2bRecords(importId: string): Promise<Gstr2bRecord[]> {
  const data = await req<{ records: Gstr2bRecord[] }>(`${API_BASE}/gstr2b/${importId}/records`);
  return data.records;
}

export async function fetchBooksOnlyPurchases(importId: string): Promise<Purchase[]> {
  const data = await req<{ purchases: Purchase[] }>(`${API_BASE}/gstr2b/${importId}/books-only`);
  return data.purchases;
}

export async function manualMatchGstr2bRecord(recordId: string, purchaseId: string): Promise<Gstr2bRecord> {
  const data = await req<{ record: Gstr2bRecord }>(`${API_BASE}/gstr2b/records/${recordId}/match`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purchaseId }),
  });
  return data.record;
}

// ── GSTR-3B ──────────────────────────────────────────────────────────────────

export async function computeGstr3b(financialYear: string, month: number): Promise<Gstr3bComputed> {
  const data = await req<{ computed: Gstr3bComputed }>(`${API_BASE}/gstr3b/compute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ financialYear, month }),
  });
  return data.computed;
}

export async function saveGstr3b(payload: {
  financialYear: string; month: number; periodLabel: string;
  computed: Gstr3bComputed; manualAdjustments?: Record<string, number>; notes?: string;
}): Promise<Gstr3bReturn> {
  const data = await req<{ return: Gstr3bReturn }>(`${API_BASE}/gstr3b/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.return;
}

export async function markGstr3bFiled(id: string, filedDate: string, filedReference: string): Promise<Gstr3bReturn> {
  const data = await req<{ return: Gstr3bReturn }>(`${API_BASE}/gstr3b/${id}/file`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filedDate, filedReference }),
  });
  return data.return;
}

export async function fetchGstr3bReturns(): Promise<Gstr3bReturn[]> {
  const data = await req<{ returns: Gstr3bReturn[] }>(`${API_BASE}/gstr3b`);
  return data.returns;
}

export async function fetchGstSummary(financialYear: string): Promise<{ returns: Gstr3bReturn[]; imports: Gstr2bImport[] }> {
  const data = await req<{ returns: Gstr3bReturn[]; imports: Gstr2bImport[] }>(`${API_BASE}/summary?financialYear=${encodeURIComponent(financialYear)}`);
  return { returns: data.returns, imports: data.imports };
}
