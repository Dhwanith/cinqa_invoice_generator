import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Download, FileText, LoaderCircle, Printer, RefreshCw, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/services/api";
import { createPayrollRun, deletePayrollRun, fetchPayrollRunForPeriod, updatePayrollEntryApi, updatePayrollRunStatus } from "@/services/payroll-api";
import { downloadCsv, PAYROLL_CSV_HEADERS, payrollEntryToRow } from "@/lib/export";
import type { PayrollEntry, PayrollRun } from "@/types/payroll";
import { MONTHS_FULL, currentPayrollPeriod, payrollPeriodLabel } from "@/types/payroll";
import { currentFinancialYear } from "@/types/gst";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:     { label: "Draft",     color: "bg-muted text-muted-foreground" },
  processed: { label: "Processed", color: "bg-blue-500/15 text-blue-600" },
  approved:  { label: "Approved",  color: "bg-amber-500/15 text-amber-700" },
  paid:      { label: "Paid",      color: "bg-success/15 text-success" },
};

function inr(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
}

function buildSalarySlipHtml(entry: PayrollEntry, run: PayrollRun, companyName: string): string {
  const emp = entry.employee!;

  const earningsRows = (
    [["Basic Salary", entry.basic], ["HRA", entry.hra], ["Special Allowance", entry.specialAllowance], ["Other Allowances", entry.otherAllowances], ...(entry.bonus > 0 ? [["Bonus", entry.bonus]] : [])] as [string, number][]
  ).filter(([, v]) => v > 0).map(([label, val]) =>
    `<div class="row"><span>${label}</span><span>${inr(val)}</span></div>`
  ).join("");

  const deductionRows = (
    [["PF (Employee)", entry.pfEmployee], ["ESI (Employee)", entry.esiEmployee], ["TDS", entry.tds], ["Other Deductions", entry.otherDeductions]] as [string, number][]
  ).filter(([, v]) => v > 0).map(([label, val]) =>
    `<div class="row"><span>${label}</span><span>${inr(val)}</span></div>`
  ).join("");

  const paymentLine = entry.paymentDate
    ? `<p style="margin-top:8px;color:#666;font-size:10px;">Paid: ${entry.paymentDate}${entry.paymentReference ? ` &nbsp;·&nbsp; Ref: ${entry.paymentReference}` : ""}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Salary Slip — ${emp.name} — ${run.periodLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 11px; line-height: 1.7; color: #111; background: #fff; padding: 32px; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #111; padding-bottom: 12px; }
    .header h1 { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; }
    .header p  { font-size: 11px; color: #555; margin-top: 2px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 24px; margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 14px; }
    .meta div { font-size: 11px; }
    .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 16px; }
    .col-head { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #444; margin-bottom: 8px; }
    .row { display: flex; justify-content: space-between; padding: 2px 0; }
    .row span:last-child { font-weight: 600; }
    .subtotal { display: flex; justify-content: space-between; border-top: 1px solid #ccc; margin-top: 6px; padding-top: 4px; font-weight: 700; }
    .net { display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #111; margin-top: 16px; padding-top: 12px; }
    .net-label { font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; }
    .net-amount { font-size: 22px; font-weight: 900; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 40px; padding-top: 12px; border-top: 1px solid #ccc; text-align: center; font-size: 10px; color: #666; }
    .sig-line { height: 32px; border-bottom: 1px solid #aaa; margin-bottom: 4px; }
    .footer { text-align: center; font-size: 9px; color: #999; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${companyName}</h1>
    <p>Salary Slip &mdash; ${run.periodLabel}</p>
  </div>

  <div class="meta">
    <div><b>Name:</b> ${emp.name}</div>
    <div><b>Employee Code:</b> ${emp.employeeCode || "—"}</div>
    <div><b>Designation:</b> ${emp.designation || "—"}</div>
    <div><b>PAN:</b> ${emp.pan || "—"}</div>
    <div><b>Working Days:</b> ${entry.workingDays}</div>
    <div><b>Present Days:</b> ${entry.presentDays}</div>
    <div><b>LOP Days:</b> ${entry.lopDays}</div>
    <div><b>Bank:</b> ${emp.bankName || "—"}${emp.bankAccount ? ` &middot; ${emp.bankAccount}` : ""}</div>
  </div>

  <div class="columns">
    <div>
      <p class="col-head">Earnings</p>
      ${earningsRows}
      <div class="subtotal"><span>Gross Earnings</span><span>${inr(entry.grossSalary)}</span></div>
    </div>
    <div>
      <p class="col-head">Deductions</p>
      ${deductionRows || '<div class="row"><span>—</span><span>—</span></div>'}
      <div class="subtotal"><span>Total Deductions</span><span>${inr(entry.totalDeductions)}</span></div>
    </div>
  </div>

  <div class="net">
    <span class="net-label">Net Salary</span>
    <span class="net-amount">${inr(entry.netSalary)}</span>
  </div>

  ${paymentLine}

  <div class="signatures">
    <div><div class="sig-line"></div><p>Employee Signature</p></div>
    <div><div class="sig-line"></div><p>Authorised Signatory</p></div>
  </div>

  <p class="footer">This is a computer-generated salary slip.</p>
  <script>window.onload = function () { window.focus(); window.print(); };</script>
</body>
</html>`;
}

function printSalarySlip(entry: PayrollEntry, run: PayrollRun, companyName: string) {
  const html = buildSalarySlipHtml(entry, run, companyName);
  const w = window.open("", "_blank", "width=860,height=700");
  if (!w) { toast.error("Pop-up blocked — please allow pop-ups for this site."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function SalarySlip({ entry, run, companyName }: { entry: PayrollEntry; run: PayrollRun; companyName: string }) {
  const emp = entry.employee;
  if (!emp) return null;
  return (
    <div className="font-mono text-[11px] leading-relaxed">
      <div className="text-center mb-4 pb-3 border-b-2 border-border">
        <p className="text-base font-black uppercase tracking-wide">{companyName}</p>
        <p className="text-xs text-muted-foreground">Salary Slip — {run.periodLabel}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-6 mb-4 pb-3 border-b border-border text-[11px]">
        <div><b>Name:</b> {emp.name}</div>
        <div><b>Code:</b> {emp.employeeCode || "—"}</div>
        <div><b>Designation:</b> {emp.designation || "—"}</div>
        <div><b>PAN:</b> {emp.pan || "—"}</div>
        <div><b>Working Days:</b> {entry.workingDays}</div>
        <div><b>Present Days:</b> {entry.presentDays}</div>
        <div><b>LOP Days:</b> {entry.lopDays}</div>
        <div><b>Bank:</b> {emp.bankName || "—"} {emp.bankAccount ? `· ${emp.bankAccount}` : ""}</div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="font-bold mb-2 uppercase text-[9px] tracking-wider text-muted-foreground">Earnings</p>
          {[["Basic Salary", entry.basic], ["HRA", entry.hra], ["Special Allowance", entry.specialAllowance], ["Other Allowances", entry.otherAllowances], ...(entry.bonus > 0 ? [["Bonus", entry.bonus]] : [])].filter(([, v]) => Number(v) > 0).map(([label, val]) => (
            <div key={label as string} className="flex justify-between py-0.5"><span>{label as string}</span><span className="font-semibold">{formatCurrency(val as number)}</span></div>
          ))}
          <div className="flex justify-between py-1 border-t border-border mt-1 font-bold"><span>Gross Earnings</span><span>{formatCurrency(entry.grossSalary)}</span></div>
        </div>
        <div>
          <p className="font-bold mb-2 uppercase text-[9px] tracking-wider text-muted-foreground">Deductions</p>
          {[["PF (Employee)", entry.pfEmployee], ["ESI (Employee)", entry.esiEmployee], ["TDS", entry.tds], ["Other Deductions", entry.otherDeductions]].filter(([, v]) => Number(v) > 0).map(([label, val]) => (
            <div key={label as string} className="flex justify-between py-0.5"><span>{label as string}</span><span className="font-semibold">{formatCurrency(val as number)}</span></div>
          ))}
          {[entry.pfEmployee, entry.esiEmployee, entry.tds, entry.otherDeductions].every(v => v === 0) && <div className="text-muted-foreground py-0.5">—</div>}
          <div className="flex justify-between py-1 border-t border-border mt-1 font-bold"><span>Total Deductions</span><span>{formatCurrency(entry.totalDeductions)}</span></div>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t-2 border-border flex justify-between items-center">
        <span className="font-black text-base uppercase tracking-wide">Net Salary</span>
        <span className="font-black text-2xl text-primary">{formatCurrency(entry.netSalary)}</span>
      </div>
      {entry.paymentDate && (
        <div className="mt-2 text-muted-foreground text-[10px] flex gap-4">
          <span>Paid: {entry.paymentDate}</span>
          {entry.paymentReference && <span>Ref: {entry.paymentReference}</span>}
        </div>
      )}
      <div className="mt-6 pt-4 border-t border-border grid grid-cols-2 text-center text-[10px] text-muted-foreground">
        <div><div className="h-8 border-b border-border/60 mb-1" /><p>Employee Signature</p></div>
        <div><div className="h-8 border-b border-border/60 mb-1" /><p>Authorised Signatory</p></div>
      </div>
      <p className="text-center text-[9px] text-muted-foreground mt-3">This is a computer-generated salary slip.</p>
    </div>
  );
}

function EntryRow({ entry, run, onUpdate }: { entry: PayrollEntry; run: PayrollRun; onUpdate: () => void }) {
  const [editingDays, setEditingDays] = useState(false);
  const [presentDays, setPresentDays] = useState(entry.presentDays);
  const [slipOpen, setSlipOpen] = useState(false);
  const isDraft = run.status === 'draft';

  const saveDays = async () => {
    setEditingDays(false);
    if (presentDays !== entry.presentDays) {
      try {
        await updatePayrollEntryApi(entry.id, { presentDays });
        onUpdate();
      } catch (err) {
        toast.error((err as Error).message);
      }
    }
  };

  const emp = entry.employee;
  if (!emp) return null;

  return (
    <>
      <tr className="border-t border-border hover:bg-muted/10 transition-colors">
        <td className="px-4 py-3">
          <p className="text-sm font-semibold">{emp.name}</p>
          <p className="text-xs text-muted-foreground">{emp.designation || emp.employeeType}</p>
        </td>
        <td className="px-4 py-3 text-center">
          {isDraft && editingDays ? (
            <Input type="number" min={0} max={run.workingDays} value={presentDays} onChange={(e) => setPresentDays(Number(e.target.value))} onBlur={saveDays} onKeyDown={(e) => e.key === "Enter" && saveDays()} className="h-7 w-16 text-xs text-center mx-auto" autoFocus />
          ) : (
            <button onClick={() => isDraft && setEditingDays(true)} className={`text-sm font-semibold ${entry.lopDays > 0 ? "text-amber-600" : ""} ${isDraft ? "hover:underline cursor-pointer" : "cursor-default"}`}>
              {entry.presentDays}/{run.workingDays}
              {entry.lopDays > 0 && <span className="ml-1 text-[10px]">(-{entry.lopDays})</span>}
            </button>
          )}
        </td>
        <td className="px-4 py-3 text-right text-sm font-semibold">{formatCurrency(entry.grossSalary)}</td>
        <td className="px-4 py-3 text-right text-sm text-muted-foreground">{entry.pfEmployee > 0 ? formatCurrency(entry.pfEmployee) : "—"}</td>
        <td className="px-4 py-3 text-right text-sm text-muted-foreground">{entry.tds > 0 ? formatCurrency(entry.tds) : "—"}</td>
        <td className="px-4 py-3 text-right text-sm font-bold">{formatCurrency(entry.netSalary)}</td>
        <td className="px-4 py-3 text-center">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setSlipOpen(true)}>
            <FileText size={11} /> Slip
          </Button>
        </td>
      </tr>
      <Dialog open={slipOpen} onOpenChange={setSlipOpen}>
        <DialogContent className="max-w-2xl">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm font-bold">Salary Slip — {emp.name} — {run.periodLabel}</p>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printSalarySlip(entry, run, "Cinqa Tech Solutions LLP")}>
              <Printer size={13} /> Print
            </Button>
          </div>
          <SalarySlip entry={entry} run={run} companyName="Cinqa Tech Solutions LLP" />
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function PayrollRegisterPage() {
  const qc = useQueryClient();
  const defaultPeriod = currentPayrollPeriod();
  const [month, setMonth] = useState(defaultPeriod.month);
  const [year, setYear] = useState(defaultPeriod.year);
  const [workingDays, setWorkingDays] = useState(26);
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isLoadingRun, setIsLoadingRun] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const loadRun = async () => {
    setIsLoadingRun(true);
    try {
      const r = await fetchPayrollRunForPeriod(month, year);
      setRun(r);
      setLoaded(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsLoadingRun(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: () => createPayrollRun({ month, year, periodLabel: payrollPeriodLabel(month, year), financialYear: currentFinancialYear(), workingDays }),
    onSuccess: (r) => { setRun(r); toast.success(`Payroll created for ${r.periodLabel}.`); },
    onError: (err) => toast.error((err as Error).message),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updatePayrollRunStatus(run!.id, status),
    onSuccess: async (updatedRun) => {
      toast.success(`Status updated to ${updatedRun.status}.`);
      const r = await fetchPayrollRunForPeriod(month, year);
      setRun(r);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePayrollRun(run!.id),
    onSuccess: () => { toast.success("Payroll run deleted."); setRun(null); setPendingDelete(false); },
    onError: (err) => { toast.error((err as Error).message); setPendingDelete(false); },
  });

  const statusCfg = run ? STATUS_CONFIG[run.status] : null;

  return (
    <div>
      <PageHeader kicker="Payroll" title="Payroll Register" description="Process monthly salaries, manage LOP deductions, and generate salary slips." />

      {/* Period selector */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border shadow-soft p-5 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Month</label>
            <Select value={String(month)} onValueChange={(v) => { setMonth(Number(v)); setLoaded(false); setRun(null); }}>
              <SelectTrigger className="w-[140px] h-10 rounded-xl text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS_FULL.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Year</label>
            <Select value={String(year)} onValueChange={(v) => { setYear(Number(v)); setLoaded(false); setRun(null); }}>
              <SelectTrigger className="w-[100px] h-10 rounded-xl text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{[2024, 2025, 2026, 2027].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Working Days</label>
            <Input type="number" min={1} max={31} value={workingDays} onChange={(e) => setWorkingDays(Number(e.target.value))} className="w-20 h-10 rounded-xl text-sm text-center" />
          </div>
          <Button onClick={loadRun} disabled={isLoadingRun} variant="outline" className="gap-2">
            {isLoadingRun ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Load
          </Button>
          <div className="flex-1" />
          {loaded && !run && !createMutation.isPending && (
            <Button onClick={() => createMutation.mutate()} className="gradient-warm text-primary-foreground border-0 gap-2">
              Create Payroll for {payrollPeriodLabel(month, year)}
            </Button>
          )}
          {run && statusCfg && (
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 rounded-xl text-xs font-bold ${statusCfg.color}`}>{statusCfg.label}</span>
              {run.status === 'draft' && <Button size="sm" className="bg-blue-600 text-white border-0 hover:bg-blue-700" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate('approved')}>Approve</Button>}
              {run.status === 'approved' && <Button size="sm" className="bg-success text-white border-0 hover:bg-success/90 gap-1" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate('paid')}><CheckCircle2 size={13} /> Mark Paid</Button>}
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => downloadCsv(`payroll-${run.periodLabel.replace(' ','-')}.csv`, PAYROLL_CSV_HEADERS, (run.entries || []).map(payrollEntryToRow))}><Download size={12} /> CSV</Button>
              {run.status === 'draft' && <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => setPendingDelete(true)}><Trash2 size={12} /></Button>}
            </div>
          )}
        </div>
      </motion.div>

      {/* Delete dialog */}
      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete payroll run?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the {run?.periodLabel} payroll run and all salary entries. Only draft runs can be deleted.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); deleteMutation.mutate(); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payroll table */}
      {run && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Totals strip */}
          <div className="grid grid-cols-5 gap-4">
            {[
              { label: "Gross Salary", value: run.totalGross },
              { label: "PF Deductions", value: run.totalPf },
              { label: "TDS Deductions", value: run.totalTds },
              { label: "Other Deductions", value: run.totalDeductions - run.totalPf - run.totalTds },
              { label: "Net Payable", value: run.totalNet },
            ].map((s) => (
              <div key={s.label} className="bg-card rounded-2xl border border-border p-4 shadow-soft">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1">{s.label}</p>
                <p className="text-lg font-black">{formatCurrency(s.value)}</p>
              </div>
            ))}
          </div>

          {/* Salary register table */}
          {run.status === 'draft' && <p className="text-xs text-muted-foreground">💡 Click the present days cell to adjust for LOP (Loss of Pay).</p>}
          <div className="rounded-2xl border border-border overflow-hidden shadow-soft">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>{["Employee", "Present Days", "Gross", "PF", "TDS", "Net Salary", ""].map((h) => (
                  <th key={h} className={`px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground ${h && h !== "Employee" && h !== "" ? "text-right" : "text-left"}`}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {(run.entries || []).map((entry) => (
                  <EntryRow key={entry.id} entry={entry} run={run} onUpdate={loadRun} />
                ))}
                {(run.entries || []).length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No employees found with salary structures. Add salary structures for employees first.</td></tr>
                )}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/30">
                <tr>
                  <td className="px-4 py-3 font-bold text-xs uppercase tracking-[0.1em] text-muted-foreground">Total ({(run.entries || []).length} employees)</td>
                  <td />
                  <td className="px-4 py-3 text-right font-black">{formatCurrency(run.totalGross)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-muted-foreground">{formatCurrency(run.totalPf)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-muted-foreground">{formatCurrency(run.totalTds)}</td>
                  <td className="px-4 py-3 text-right font-black text-primary">{formatCurrency(run.totalNet)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </motion.div>
      )}

      {loaded && !run && !createMutation.isPending && (
        <div className="bg-card rounded-2xl border border-dashed border-border p-16 text-center">
          <p className="text-base font-semibold text-muted-foreground mb-2">No payroll for {payrollPeriodLabel(month, year)}</p>
          <p className="text-sm text-muted-foreground mb-4">Click "Create Payroll" above to generate salary entries for all active employees with salary structures.</p>
        </div>
      )}

    </div>
  );
}
