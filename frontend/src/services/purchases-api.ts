import type { Vendor, Purchase, CreateVendorPayload, CreatePurchasePayload } from "@/types/purchase";
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

// ── Vendors ─────────────────────────────────────────────────────────────────

export async function fetchVendors(params?: { search?: string; active?: string; category?: string }): Promise<Vendor[]> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.active && params.active !== "all") q.set("active", params.active);
  if (params?.category && params.category !== "all") q.set("category", params.category);
  const data = await req<{ vendors: Vendor[] }>(`${API_BASE}/vendors${q.toString() ? `?${q}` : ""}`);
  return data.vendors;
}

export async function createVendor(payload: CreateVendorPayload): Promise<Vendor> {
  const data = await req<{ vendor: Vendor }>(`${API_BASE}/vendors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.vendor;
}

export async function updateVendor(vendorId: string, payload: CreateVendorPayload): Promise<Vendor> {
  const data = await req<{ vendor: Vendor }>(`${API_BASE}/vendors/${vendorId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.vendor;
}

// ── Purchases ────────────────────────────────────────────────────────────────

export async function fetchPurchases(params?: { search?: string; status?: string; dateFrom?: string; dateTo?: string }): Promise<Purchase[]> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.status && params.status !== "all") q.set("status", params.status);
  if (params?.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params?.dateTo) q.set("dateTo", params.dateTo);
  const data = await req<{ purchases: Purchase[] }>(`${API_BASE}/purchases${q.toString() ? `?${q}` : ""}`);
  return data.purchases;
}

export async function fetchPurchaseDetail(purchaseId: string): Promise<Purchase> {
  const data = await req<{ purchase: Purchase }>(`${API_BASE}/purchases/${purchaseId}`);
  return data.purchase;
}

export async function createPurchase(payload: CreatePurchasePayload): Promise<Purchase> {
  const data = await req<{ purchase: Purchase }>(`${API_BASE}/purchases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.purchase;
}

export async function updatePurchaseStatus(purchaseId: string, status: string, opts?: { paymentDate?: string; paymentReference?: string }): Promise<Purchase> {
  const data = await req<{ purchase: Purchase }>(`${API_BASE}/purchases/${purchaseId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, ...opts }),
  });
  return data.purchase;
}

export async function deletePurchase(purchaseId: string): Promise<{ purchaseId: string; vendorName: string; deletedLineItems: number }> {
  const data = await req<{ deleted: { purchaseId: string; vendorName: string; deletedLineItems: number } }>(`${API_BASE}/purchases/${purchaseId}`, { method: "DELETE" });
  return data.deleted;
}
