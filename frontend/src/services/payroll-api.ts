import type { CreateEmployeePayload, Employee, PayrollRun, SalaryStructure } from "@/types/payroll";
import { getAuthHeader } from "./api";

const BASE = "/api/payroll";

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

// Employees
export async function fetchEmployees(params?: { search?: string; active?: string }): Promise<Employee[]> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.active && params.active !== "all") q.set("active", params.active);
  const data = await req<{ employees: Employee[] }>(`${BASE}/employees${q.toString() ? `?${q}` : ""}`);
  return data.employees;
}

export async function createEmployee(payload: CreateEmployeePayload): Promise<Employee> {
  const data = await req<{ employee: Employee }>(`${BASE}/employees`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  return data.employee;
}

export async function updateEmployee(id: string, payload: Partial<CreateEmployeePayload> & { active?: boolean }): Promise<Employee> {
  const data = await req<{ employee: Employee }>(`${BASE}/employees/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  return data.employee;
}

export async function fetchSalaryStructure(employeeId: string): Promise<SalaryStructure | null> {
  const data = await req<{ structure: SalaryStructure | null }>(`${BASE}/employees/${employeeId}/salary`);
  return data.structure;
}

export async function saveSalaryStructure(employeeId: string, payload: Partial<SalaryStructure>): Promise<SalaryStructure> {
  const data = await req<{ structure: SalaryStructure }>(`${BASE}/employees/${employeeId}/salary`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  return data.structure;
}

// Payroll Runs
export async function fetchPayrollRuns(): Promise<PayrollRun[]> {
  const data = await req<{ runs: PayrollRun[] }>(`${BASE}/runs`);
  return data.runs;
}

export async function fetchPayrollRunForPeriod(month: number, year: number): Promise<PayrollRun | null> {
  const data = await req<{ run: PayrollRun | null }>(`${BASE}/runs/period?month=${month}&year=${year}`);
  return data.run;
}

export async function fetchPayrollRun(runId: string): Promise<PayrollRun> {
  const data = await req<{ run: PayrollRun }>(`${BASE}/runs/${runId}`);
  return data.run;
}

export async function createPayrollRun(payload: { month: number; year: number; periodLabel: string; financialYear: string; workingDays: number }): Promise<PayrollRun> {
  const data = await req<{ run: PayrollRun }>(`${BASE}/runs`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  return data.run;
}

export async function updatePayrollEntryApi(entryId: string, payload: { presentDays?: number; bonus?: number; otherDeductions?: number }): Promise<void> {
  await req<{ ok: boolean }>(`${BASE}/entries/${entryId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}

export async function updatePayrollRunStatus(runId: string, status: string): Promise<PayrollRun> {
  const data = await req<{ run: PayrollRun }>(`${BASE}/runs/${runId}/status`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
  });
  return data.run;
}

export async function deletePayrollRun(runId: string): Promise<void> {
  await req<{ ok: boolean }>(`${BASE}/runs/${runId}`, { method: "DELETE" });
}
