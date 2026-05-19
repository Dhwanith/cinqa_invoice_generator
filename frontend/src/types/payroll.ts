export type EmployeeType = 'employee' | 'partner' | 'consultant';
export type PayrollStatus = 'draft' | 'processed' | 'approved' | 'paid';

export interface Employee {
  id: string;
  name: string;
  employeeCode: string;
  pan: string;
  employeeType: EmployeeType;
  designation: string;
  department: string;
  joinDate: string;
  exitDate: string;
  bankAccount: string;
  bankIfsc: string;
  bankName: string;
  pfApplicable: boolean;
  esiApplicable: boolean;
  tdsApplicable: boolean;
  active: boolean;
  notes: string;
}

export interface SalaryStructure {
  id: string;
  employeeId: string;
  effectiveFrom: string;
  basic: number;
  hra: number;
  specialAllowance: number;
  otherAllowances: number;
  totalGross: number;
  pfEmployeeRate: number;
  esiEmployeeRate: number;
  tdsMonthly: number;
}

export interface PayrollEntry {
  id: string;
  employeeId: string;
  payrollRunId: string;
  workingDays: number;
  presentDays: number;
  lopDays: number;
  basic: number;
  hra: number;
  specialAllowance: number;
  otherAllowances: number;
  bonus: number;
  grossSalary: number;
  pfEmployee: number;
  esiEmployee: number;
  tds: number;
  professionalTax: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  paymentStatus: 'pending' | 'paid';
  paymentDate: string;
  paymentReference: string;
  employee: Employee | null;
}

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  periodLabel: string;
  financialYear: string;
  workingDays: number;
  status: PayrollStatus;
  notes: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  totalTds: number;
  totalPf: number;
  processedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  entries: PayrollEntry[];
}

export interface CreateEmployeePayload {
  name: string;
  employeeCode: string;
  pan: string;
  employeeType: EmployeeType;
  designation: string;
  department: string;
  joinDate: string;
  bankAccount: string;
  bankIfsc: string;
  bankName: string;
  pfApplicable: boolean;
  esiApplicable: boolean;
  tdsApplicable: boolean;
  notes: string;
}

export const MONTHS_FULL = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
];

export function payrollPeriodLabel(month: number, year: number): string {
  return `${MONTHS_FULL.find((m) => m.value === month)?.label ?? ''} ${year}`;
}

export function currentPayrollPeriod(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}
