import type { Reimbursement, CreateReimbursementPayload } from "@/types/reimbursement";
import { getAuthHeader } from "./api";

const API_BASE = "/api";

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

export async function fetchReimbursements(params?: {
  search?: string; status?: string; paidBy?: string; dateFrom?: string; dateTo?: string;
}): Promise<Reimbursement[]> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.status && params.status !== "all") q.set("status", params.status);
  if (params?.paidBy && params.paidBy !== "all") q.set("paidBy", params.paidBy);
  if (params?.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params?.dateTo) q.set("dateTo", params.dateTo);
  const data = await req<{ reimbursements: Reimbursement[] }>(`${API_BASE}/reimbursements${q.toString() ? `?${q}` : ""}`);
  return data.reimbursements;
}

export async function createReimbursement(payload: CreateReimbursementPayload): Promise<Reimbursement> {
  const data = await req<{ reimbursement: Reimbursement }>(`${API_BASE}/reimbursements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.reimbursement;
}

export async function approveReimbursement(id: string): Promise<Reimbursement> {
  const data = await req<{ reimbursement: Reimbursement }>(`${API_BASE}/reimbursements/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "approved" }),
  });
  return data.reimbursement;
}

export async function rejectReimbursement(id: string): Promise<Reimbursement> {
  const data = await req<{ reimbursement: Reimbursement }>(`${API_BASE}/reimbursements/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "rejected" }),
  });
  return data.reimbursement;
}

export async function markReimbursed(id: string, opts: { reimbursedDate: string; reimbursedAmount: number; paymentReference: string }): Promise<Reimbursement> {
  const data = await req<{ reimbursement: Reimbursement }>(`${API_BASE}/reimbursements/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "reimbursed", ...opts }),
  });
  return data.reimbursement;
}

export async function bulkApprove(ids: string[]): Promise<{ approved: Reimbursement[]; count: number }> {
  const data = await req<{ approved: Reimbursement[]; count: number }>(`${API_BASE}/reimbursements/bulk-approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return data;
}

export async function deleteReimbursement(id: string): Promise<void> {
  await req<{ ok: boolean }>(`${API_BASE}/reimbursements/${id}`, { method: "DELETE" });
}
