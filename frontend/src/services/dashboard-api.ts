import { getAuthHeader } from "./api";

export interface DashboardSummary {
  period: { dateFrom: string; dateTo: string };
  revenue: number;
  purchases: number;
  reimbursements: number;
  totalExpenses: number;
  netProfit: number;
  outstandingAR: number;
  outstandingAP: number;
  pendingReimbursements: number;
  itcBalance: number;
  bankBalance: number | null;
  bankDate: string | null;
  gstPayable: number | null;
  latestGstr3b: { status: string; periodLabel: string; filedDate: string | null } | null;
  counts: {
    unpaidInvoices: number;
    unpaidPurchases: number;
    pendingReimbs: number;
    invoiceCount: number;
    activeEmployees: number;
  };
  recent: {
    invoices: Array<{ id: string; invoiceNo: string; clientName: string; total: number; invoiceDate: string; status: string; invoiceType: string }>;
    purchases: Array<{ id: string; vendorName: string; purchaseNumber: string; total: number; purchaseDate: string; status: string; category: string }>;
    pendingReimbs: Array<{ id: string; paidBy: string; description: string; amount: number; date: string }>;
  };
}

export async function fetchDashboard(params?: { dateFrom?: string; dateTo?: string }): Promise<DashboardSummary> {
  const authHeader = await getAuthHeader();
  const q = new URLSearchParams();
  if (params?.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params?.dateTo) q.set("dateTo", params.dateTo);
  const response = await fetch(`/api/dashboard${q.toString() ? `?${q}` : ""}`, {
    headers: { ...(authHeader ? { Authorization: authHeader } : {}) },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Dashboard fetch failed.");
  return data.summary;
}
