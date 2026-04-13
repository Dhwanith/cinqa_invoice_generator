import type { Client, Invoice, HealthData, LineItem } from "@/types/invoice";

const API_BASE = "/api";

type ApiEnvelope<T> = T & { ok: boolean; error?: string };

export interface AuthSession {
  configured: boolean;
  authenticated: boolean;
  username: string;
}

export interface CreateClientPayload {
  name: string;
  gstin: string;
  state: string;
  stateCode: number;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  defaultSac: string;
  defaultPaymentTermsDays: number;
  email: string;
  phone: string;
  active: boolean;
  notes: string;
}

export interface CreateInvoiceResult {
  invoiceNo?: string;
  total?: number;
  googleDriveUrl?: string;
  googleDriveFileId?: string;
  invoiceRecordId?: string;
  [key: string]: unknown;
}

export interface DeleteInvoiceResult {
  invoiceId: string;
  invoiceNo: string;
  deletedLineItems: number;
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as ApiEnvelope<T>;
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent("app-auth-expired"));
  }
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

export async function fetchAuthSession(): Promise<AuthSession> {
  return requestJson<AuthSession>(`${API_BASE}/auth/session`, { cache: "no-store" });
}

export async function loginApp(payload: { username: string; password: string }): Promise<AuthSession> {
  return requestJson<AuthSession>(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function logoutApp(): Promise<AuthSession> {
  return requestJson<AuthSession>(`${API_BASE}/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

export async function fetchHealth(): Promise<HealthData> {
  return requestJson<HealthData>(`${API_BASE}/health`);
}

export async function fetchClients(params?: { search?: string; active?: string }): Promise<Client[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.active && params.active !== "all") query.set("active", params.active);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const data = await requestJson<{ clients: Client[] }>(`${API_BASE}/clients${suffix}`);
  return data.clients;
}

export async function createClient(payload: CreateClientPayload): Promise<Client> {
  const data = await requestJson<{ client: Client }>(`${API_BASE}/clients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.client;
}

export async function updateClient(clientId: string, payload: CreateClientPayload): Promise<Client> {
  const data = await requestJson<{ client: Client }>(`${API_BASE}/clients/${clientId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.client;
}

export async function fetchInvoices(params?: { search?: string; status?: string }): Promise<Invoice[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.status && params.status !== "all") query.set("status", params.status);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const data = await requestJson<{ invoices: Invoice[] }>(`${API_BASE}/invoices${suffix}`);
  return data.invoices;
}

export async function fetchInvoiceDetail(invoiceId: string): Promise<Invoice> {
  const data = await requestJson<{ invoice: Invoice }>(`${API_BASE}/invoices/${invoiceId}`);
  return data.invoice;
}

export async function updateInvoiceStatus(invoiceId: string, status: string): Promise<Invoice> {
  const data = await requestJson<{ invoice: Invoice }>(`${API_BASE}/invoices/${invoiceId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return data.invoice;
}

export async function createInvoice(payload: { clientId: string; invoiceDate: string; invoiceType?: "tax" | "proforma"; showQuantity?: boolean; includeDueDate?: boolean; lineItems: LineItem[] }): Promise<CreateInvoiceResult> {
  const data = await requestJson<{ invoice: CreateInvoiceResult }>(`${API_BASE}/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.invoice;
}

export async function deleteInvoice(invoiceId: string): Promise<DeleteInvoiceResult> {
  const data = await requestJson<{ deleted: DeleteInvoiceResult }>(`${API_BASE}/invoices/${invoiceId}`, {
    method: "DELETE",
  });
  return data.deleted;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function formatDate(value: string): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
