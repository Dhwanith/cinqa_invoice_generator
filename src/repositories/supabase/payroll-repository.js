import { getSupabaseClient, getDefaultOrgId } from '../../lib/supabase.js';

function r2(v) { return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100; }

// ── Employee helpers ──────────────────────────────────────────────────────────

function normalizeEmployee(row) {
  return {
    id: row.id, name: row.name, employeeCode: row.employee_code || '',
    pan: row.pan || '', employeeType: row.employee_type || 'employee',
    designation: row.designation || '', department: row.department || '',
    joinDate: row.join_date || '', exitDate: row.exit_date || '',
    bankAccount: row.bank_account || '', bankIfsc: row.bank_ifsc || '', bankName: row.bank_name || '',
    pfApplicable: Boolean(row.pf_applicable), esiApplicable: Boolean(row.esi_applicable),
    tdsApplicable: Boolean(row.tds_applicable), active: Boolean(row.active), notes: row.notes || '',
  };
}

function normalizeSalaryStructure(row) {
  if (!row) return null;
  const basic = Number(row.basic || 0), hra = Number(row.hra || 0),
    special = Number(row.special_allowance || 0), other = Number(row.other_allowances || 0);
  return {
    id: row.id, employeeId: row.employee_id, effectiveFrom: row.effective_from,
    basic, hra, specialAllowance: special, otherAllowances: other,
    totalGross: r2(basic + hra + special + other),
    pfEmployeeRate: Number(row.pf_employee_rate || 12),
    esiEmployeeRate: Number(row.esi_employee_rate || 0.75),
    tdsMonthly: Number(row.tds_monthly || 0),
  };
}

// ── Payroll computation ────────────────────────────────────────────────────────

function computeEntry(employee, structure, workingDays, presentDays) {
  const wd = workingDays; const pd = presentDays;
  const lopDays = Math.max(0, wd - pd);
  const f = wd > 0 ? pd / wd : 1; // present fraction

  const basic = r2(structure.basic * f);
  const hra = r2(structure.hra * f);
  const specialAllowance = r2(structure.specialAllowance * f);
  const otherAllowances = r2(structure.otherAllowances * f);
  const grossSalary = r2(basic + hra + specialAllowance + otherAllowances);

  const pfRate = (structure.pfEmployeeRate || 12) / 100;
  const esiRate = (structure.esiEmployeeRate || 0.75) / 100;
  const tdsFull = structure.tdsMonthly || 0;

  // PF: 12% of basic (capped at ₹15,000 basic for mandatory EPFO)
  const pfEmployee = employee.pfApplicable ? r2(Math.min(basic, 15000) * pfRate) : 0;
  // ESI: 0.75% of gross — only if gross ≤ ₹21,000
  const esiEmployee = employee.esiApplicable && grossSalary <= 21000 ? r2(grossSalary * esiRate) : 0;
  // TDS: pro-rate monthly estimate for LOP days
  const tds = employee.tdsApplicable ? r2(tdsFull * f) : 0;

  const totalDeductions = r2(pfEmployee + esiEmployee + tds);
  const netSalary = r2(grossSalary - totalDeductions);

  return { workingDays: wd, presentDays: pd, lopDays, basic, hra, specialAllowance, otherAllowances, bonus: 0, grossSalary, pfEmployee, esiEmployee, tds, professionalTax: 0, otherDeductions: 0, totalDeductions, netSalary };
}

async function getLatestSalaryStructure(employeeId) {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('salary_structures').select('*')
    .eq('employee_id', employeeId)
    .order('effective_from', { ascending: false }).limit(1).maybeSingle();
  return normalizeSalaryStructure(data);
}

async function recomputeRunTotals(runId) {
  const supabase = getSupabaseClient();
  const { data: entries } = await supabase.from('payroll_entries').select('gross_salary,total_deductions,net_salary,pf_employee,tds').eq('payroll_run_id', runId);
  const totals = (entries || []).reduce((acc, e) => ({
    total_gross: r2(acc.total_gross + Number(e.gross_salary || 0)),
    total_deductions: r2(acc.total_deductions + Number(e.total_deductions || 0)),
    total_net: r2(acc.total_net + Number(e.net_salary || 0)),
    total_pf: r2(acc.total_pf + Number(e.pf_employee || 0)),
    total_tds: r2(acc.total_tds + Number(e.tds || 0)),
  }), { total_gross: 0, total_deductions: 0, total_net: 0, total_pf: 0, total_tds: 0 });
  await supabase.from('payroll_runs').update(totals).eq('id', runId);
}

// ── Employee CRUD ─────────────────────────────────────────────────────────────

export async function listEmployees({ search = '', active = 'all' } = {}) {
  const supabase = getSupabaseClient();
  let query = supabase.from('employees').select('*').eq('organization_id', getDefaultOrgId()).order('name').limit(200);
  if (search) query = query.ilike('name', `%${search}%`);
  if (active === 'active') query = query.eq('active', true);
  if (active === 'inactive') query = query.eq('active', false);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to list employees: ${error.message}`);
  return (data || []).map(normalizeEmployee);
}

export async function createEmployee(emp) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('employees').insert({
    organization_id: getDefaultOrgId(), name: emp.name, employee_code: emp.employeeCode || '',
    pan: emp.pan || '', employee_type: emp.employeeType || 'employee',
    designation: emp.designation || '', department: emp.department || '',
    join_date: emp.joinDate || null, exit_date: emp.exitDate || null,
    bank_account: emp.bankAccount || '', bank_ifsc: emp.bankIfsc || '', bank_name: emp.bankName || '',
    pf_applicable: Boolean(emp.pfApplicable), esi_applicable: Boolean(emp.esiApplicable),
    tds_applicable: emp.tdsApplicable !== false, active: true, notes: emp.notes || '',
  }).select().single();
  if (error) throw new Error(`Failed to create employee: ${error.message}`);
  return normalizeEmployee(data);
}

export async function updateEmployee(id, emp) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('employees').update({
    name: emp.name, employee_code: emp.employeeCode || '', pan: emp.pan || '',
    employee_type: emp.employeeType || 'employee', designation: emp.designation || '',
    department: emp.department || '', join_date: emp.joinDate || null, exit_date: emp.exitDate || null,
    bank_account: emp.bankAccount || '', bank_ifsc: emp.bankIfsc || '', bank_name: emp.bankName || '',
    pf_applicable: Boolean(emp.pfApplicable), esi_applicable: Boolean(emp.esiApplicable),
    tds_applicable: emp.tdsApplicable !== false, active: emp.active !== false, notes: emp.notes || '',
  }).eq('id', id).select().single();
  if (error) throw new Error(`Failed to update employee: ${error.message}`);
  return normalizeEmployee(data);
}

export async function getSalaryStructure(employeeId) {
  return getLatestSalaryStructure(employeeId);
}

export async function upsertSalaryStructure(employeeId, data) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();
  const { data: result, error } = await supabase.from('salary_structures').upsert({
    organization_id: orgId, employee_id: employeeId,
    effective_from: data.effectiveFrom || new Date().toISOString().slice(0, 10),
    basic: Number(data.basic || 0), hra: Number(data.hra || 0),
    special_allowance: Number(data.specialAllowance || 0), other_allowances: Number(data.otherAllowances || 0),
    pf_employee_rate: Number(data.pfEmployeeRate || 12), esi_employee_rate: Number(data.esiEmployeeRate || 0.75),
    tds_monthly: Number(data.tdsMonthly || 0),
  }, { onConflict: 'employee_id,effective_from' }).select().single();
  if (error) throw new Error(`Failed to save salary structure: ${error.message}`);
  return normalizeSalaryStructure(result);
}

// ── Payroll Runs ──────────────────────────────────────────────────────────────

function normalizeRun(row, entries = []) {
  return {
    id: row.id, month: row.month, year: row.year, periodLabel: row.period_label,
    financialYear: row.financial_year || '', workingDays: row.working_days || 26,
    status: row.status, notes: row.notes || '',
    totalGross: Number(row.total_gross || 0), totalDeductions: Number(row.total_deductions || 0),
    totalNet: Number(row.total_net || 0), totalTds: Number(row.total_tds || 0), totalPf: Number(row.total_pf || 0),
    processedAt: row.processed_at, approvedAt: row.approved_at, paidAt: row.paid_at,
    createdAt: row.created_at, entries,
  };
}

function normalizeEntry(row) {
  return {
    id: row.id, employeeId: row.employee_id, payrollRunId: row.payroll_run_id,
    workingDays: row.working_days, presentDays: row.present_days, lopDays: row.lop_days,
    basic: Number(row.basic), hra: Number(row.hra), specialAllowance: Number(row.special_allowance),
    otherAllowances: Number(row.other_allowances), bonus: Number(row.bonus || 0),
    grossSalary: Number(row.gross_salary), pfEmployee: Number(row.pf_employee),
    esiEmployee: Number(row.esi_employee), tds: Number(row.tds),
    professionalTax: Number(row.professional_tax || 0), otherDeductions: Number(row.other_deductions || 0),
    totalDeductions: Number(row.total_deductions), netSalary: Number(row.net_salary),
    paymentStatus: row.payment_status, paymentDate: row.payment_date || '', paymentReference: row.payment_reference || '',
    employee: row.employees ? normalizeEmployee(row.employees) : null,
  };
}

export async function listPayrollRuns() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('payroll_runs').select('*').eq('organization_id', getDefaultOrgId()).order('year', { ascending: false }).order('month', { ascending: false }).limit(24);
  if (error) throw new Error(`Failed to list runs: ${error.message}`);
  return (data || []).map((r) => normalizeRun(r));
}

export async function getPayrollRun(runId) {
  const supabase = getSupabaseClient();
  const [{ data: run }, { data: entries }] = await Promise.all([
    supabase.from('payroll_runs').select('*').eq('id', runId).single(),
    supabase.from('payroll_entries').select('*, employees(*)').eq('payroll_run_id', runId).order('employees(name)'),
  ]);
  if (!run) throw new Error('Payroll run not found.');
  return normalizeRun(run, (entries || []).map(normalizeEntry));
}

export async function getPayrollRunForPeriod(month, year) {
  const supabase = getSupabaseClient();
  const { data: run } = await supabase.from('payroll_runs').select('*').eq('organization_id', getDefaultOrgId()).eq('month', month).eq('year', year).maybeSingle();
  if (!run) return null;
  const { data: entries } = await supabase.from('payroll_entries').select('*, employees(*)').eq('payroll_run_id', run.id).order('employees(name)');
  return normalizeRun(run, (entries || []).map(normalizeEntry));
}

export async function createPayrollRun({ month, year, periodLabel, financialYear, workingDays = 26 }) {
  const supabase = getSupabaseClient();
  const orgId = getDefaultOrgId();

  // Check for existing run
  const { data: existing } = await supabase.from('payroll_runs').select('id').eq('organization_id', orgId).eq('month', month).eq('year', year).maybeSingle();
  if (existing) throw new Error(`Payroll for ${periodLabel} already exists.`);

  // Fetch active employees
  const { data: empRows } = await supabase.from('employees').select('*').eq('organization_id', orgId).eq('active', true);
  const employees = (empRows || []).map(normalizeEmployee);

  // Get salary structures
  const structures = await Promise.all(employees.map((emp) => getLatestSalaryStructure(emp.id)));

  // Filter employees with salary structures
  const toProcess = employees.filter((_, i) => structures[i] !== null);

  // Create run
  const { data: run, error: runErr } = await supabase.from('payroll_runs').insert({
    organization_id: orgId, month, year, period_label: periodLabel,
    financial_year: financialYear || '', working_days: workingDays, status: 'draft',
    processed_at: new Date().toISOString(),
  }).select().single();
  if (runErr) throw new Error(`Failed to create run: ${runErr.message}`);

  // Compute and insert entries
  const entryRows = toProcess.map((emp, i) => {
    const struct = structures[employees.indexOf(emp)];
    const computed = computeEntry(emp, struct, workingDays, workingDays);
    return {
      payroll_run_id: run.id, organization_id: orgId, employee_id: emp.id,
      working_days: workingDays, present_days: workingDays, lop_days: 0,
      basic: computed.basic, hra: computed.hra, special_allowance: computed.specialAllowance,
      other_allowances: computed.otherAllowances, bonus: 0, gross_salary: computed.grossSalary,
      pf_employee: computed.pfEmployee, esi_employee: computed.esiEmployee, tds: computed.tds,
      professional_tax: 0, other_deductions: 0, total_deductions: computed.totalDeductions,
      net_salary: computed.netSalary,
    };
  });

  if (entryRows.length > 0) {
    const { error: entryErr } = await supabase.from('payroll_entries').insert(entryRows);
    if (entryErr) throw new Error(`Failed to create entries: ${entryErr.message}`);
  }

  await recomputeRunTotals(run.id);
  return getPayrollRun(run.id);
}

export async function updatePayrollEntry(entryId, { presentDays, bonus, otherDeductions }) {
  const supabase = getSupabaseClient();

  // Fetch entry + employee + run for recomputation
  const { data: entry } = await supabase.from('payroll_entries').select('*, employees(*), payroll_runs(working_days)').eq('id', entryId).single();
  if (!entry) throw new Error('Entry not found.');

  const emp = normalizeEmployee(entry.employees);
  const wd = entry.payroll_runs?.working_days || entry.working_days || 26;
  const pd = presentDays !== undefined ? Number(presentDays) : entry.present_days;
  const bonusAmount = bonus !== undefined ? Number(bonus) : Number(entry.bonus || 0);
  const otherDedAmount = otherDeductions !== undefined ? Number(otherDeductions) : Number(entry.other_deductions || 0);

  // Reconstruct structure from entry's original full-day amounts
  const struct = {
    basic: r2(wd > 0 ? Number(entry.basic) / (entry.present_days / wd) : Number(entry.basic)),
    hra: r2(wd > 0 ? Number(entry.hra) / (entry.present_days / wd) : Number(entry.hra)),
    specialAllowance: r2(wd > 0 ? Number(entry.special_allowance) / (entry.present_days / wd) : Number(entry.special_allowance)),
    otherAllowances: r2(wd > 0 ? Number(entry.other_allowances) / (entry.present_days / wd) : Number(entry.other_allowances)),
    pfEmployeeRate: 12, esiEmployeeRate: 0.75, tdsMonthly: r2(wd > 0 ? Number(entry.tds) / (entry.present_days / wd) : Number(entry.tds)),
  };

  const computed = computeEntry(emp, struct, wd, pd);
  const grossWithBonus = r2(computed.grossSalary + bonusAmount);
  const totalDed = r2(computed.totalDeductions + otherDedAmount);
  const netSalary = r2(grossWithBonus - totalDed);

  await supabase.from('payroll_entries').update({
    present_days: pd, lop_days: Math.max(0, wd - pd),
    basic: computed.basic, hra: computed.hra, special_allowance: computed.specialAllowance,
    other_allowances: computed.otherAllowances, bonus: bonusAmount, gross_salary: grossWithBonus,
    pf_employee: computed.pfEmployee, esi_employee: computed.esiEmployee, tds: computed.tds,
    other_deductions: otherDedAmount, total_deductions: totalDed, net_salary: netSalary,
  }).eq('id', entryId);

  await recomputeRunTotals(entry.payroll_run_id);
}

export async function updatePayrollRunStatus(runId, status) {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const updateData = { status, ...(status === 'approved' ? { approved_at: now } : {}), ...(status === 'paid' ? { paid_at: now } : {}) };
  const { data, error } = await supabase.from('payroll_runs').update(updateData).eq('id', runId).select().single();
  if (error) throw new Error(`Failed to update status: ${error.message}`);
  return normalizeRun(data);
}

export async function deletePayrollRun(runId) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('payroll_runs').delete().eq('id', runId).eq('status', 'draft');
  if (error) throw new Error(`Failed to delete run: ${error.message}`);
}
