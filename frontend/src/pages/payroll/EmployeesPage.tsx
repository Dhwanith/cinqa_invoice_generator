import { type FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { IndianRupee, Plus, Search, UserCheck, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/services/api";
import { createEmployee, fetchEmployees, fetchSalaryStructure, saveSalaryStructure, updateEmployee } from "@/services/payroll-api";
import type { CreateEmployeePayload, Employee, EmployeeType, SalaryStructure } from "@/types/payroll";

const defaultForm: CreateEmployeePayload = {
  name: "", employeeCode: "", pan: "", employeeType: "employee",
  designation: "", department: "", joinDate: "", bankAccount: "",
  bankIfsc: "", bankName: "", pfApplicable: false, esiApplicable: false,
  tdsApplicable: true, notes: "",
};

const TYPE_LABELS: Record<EmployeeType, string> = { employee: "Employee", partner: "Partner", consultant: "Consultant" };

export default function EmployeesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<CreateEmployeePayload>(defaultForm);
  const [salaryEmployee, setSalaryEmployee] = useState<Employee | null>(null);
  const [salaryForm, setSalaryForm] = useState<Partial<SalaryStructure>>({});

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees", search, filter],
    queryFn: () => fetchEmployees({ search, active: filter }),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: CreateEmployeePayload) =>
      editingEmployee ? updateEmployee(editingEmployee.id, payload) : createEmployee(payload),
    onSuccess: (emp) => {
      toast.success(editingEmployee ? `Updated ${emp.name}` : `Added ${emp.name}`);
      qc.invalidateQueries({ queryKey: ["employees"] });
      handleCancel();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const salarySaveMutation = useMutation({
    mutationFn: () => saveSalaryStructure(salaryEmployee!.id, { ...salaryForm, effectiveFrom: salaryForm.effectiveFrom || new Date().toISOString().slice(0, 10) }),
    onSuccess: () => { toast.success("Salary structure saved."); setSalaryEmployee(null); },
    onError: (err) => toast.error((err as Error).message),
  });

  const upd = <K extends keyof CreateEmployeePayload>(k: K, v: CreateEmployeePayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setForm({ name: emp.name, employeeCode: emp.employeeCode, pan: emp.pan, employeeType: emp.employeeType, designation: emp.designation, department: emp.department, joinDate: emp.joinDate, bankAccount: emp.bankAccount, bankIfsc: emp.bankIfsc, bankName: emp.bankName, pfApplicable: emp.pfApplicable, esiApplicable: emp.esiApplicable, tdsApplicable: emp.tdsApplicable, notes: emp.notes });
    setShowForm(true);
  };

  const handleCancel = () => { setEditingEmployee(null); setForm(defaultForm); setShowForm(false); };

  const openSalary = async (emp: Employee) => {
    const struct = await fetchSalaryStructure(emp.id).catch(() => null);
    setSalaryForm(struct ? { basic: struct.basic, hra: struct.hra, specialAllowance: struct.specialAllowance, otherAllowances: struct.otherAllowances, pfEmployeeRate: struct.pfEmployeeRate, esiEmployeeRate: struct.esiEmployeeRate, tdsMonthly: struct.tdsMonthly, effectiveFrom: struct.effectiveFrom } : { pfEmployeeRate: 12, esiEmployeeRate: 0.75, tdsMonthly: 0 });
    setSalaryEmployee(emp);
  };

  const salaryGross = ((salaryForm.basic || 0) + (salaryForm.hra || 0) + (salaryForm.specialAllowance || 0) + (salaryForm.otherAllowances || 0));

  return (
    <div>
      <PageHeader
        kicker="Payroll"
        title="Employees"
        description="Manage employee and partner master records, salary structures, and deduction settings."
        action={
          <Button onClick={() => { if (showForm) handleCancel(); else { setEditingEmployee(null); setForm(defaultForm); setShowForm(true); } }} className="gradient-warm text-primary-foreground border-0 shadow-soft hover:shadow-elevated hover:-translate-y-0.5 transition-all">
            <Plus size={16} className="mr-2" /> Add Employee
          </Button>
        }
      />

      {/* Add/Edit form */}
      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mb-8 overflow-hidden">
          <div className="bg-card rounded-2xl border border-border shadow-soft p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2"><UserCheck size={18} className="text-primary" /><h3 className="text-lg font-bold">{editingEmployee ? `Edit ${editingEmployee.name}` : "Add Employee"}</h3></div>
              <button onClick={handleCancel} className="p-2 rounded-xl hover:bg-muted"><X size={18} className="text-muted-foreground" /></button>
            </div>
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); saveMutation.mutate(form); }} className="grid gap-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-1.5 sm:col-span-2"><label className="text-xs font-semibold text-muted-foreground">Full Name</label><Input value={form.name} onChange={(e) => upd("name", e.target.value)} placeholder="Employee full name" required /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">Employee Code</label><Input value={form.employeeCode} onChange={(e) => upd("employeeCode", e.target.value)} placeholder="EMP001" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">Type</label>
                  <Select value={form.employeeType} onValueChange={(v) => upd("employeeType", v as EmployeeType)}>
                    <SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">Designation</label><Input value={form.designation} onChange={(e) => upd("designation", e.target.value)} placeholder="Software Engineer" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">Department</label><Input value={form.department} onChange={(e) => upd("department", e.target.value)} placeholder="Engineering" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">PAN</label><Input value={form.pan} onChange={(e) => upd("pan", e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">Join Date</label><Input type="date" value={form.joinDate} onChange={(e) => upd("joinDate", e.target.value)} /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">Bank Account</label><Input value={form.bankAccount} onChange={(e) => upd("bankAccount", e.target.value)} placeholder="Account number" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">Bank Name</label><Input value={form.bankName} onChange={(e) => upd("bankName", e.target.value)} placeholder="Axis Bank" /></div>
                <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">IFSC</label><Input value={form.bankIfsc} onChange={(e) => upd("bankIfsc", e.target.value.toUpperCase())} placeholder="UTIB0005112" /></div>
              </div>
              <div className="flex flex-wrap gap-6">
                {[{ label: "PF Applicable", key: "pfApplicable" as const }, { label: "ESI Applicable", key: "esiApplicable" as const }, { label: "TDS Applicable", key: "tdsApplicable" as const }].map(({ label, key }) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={form[key]} onCheckedChange={(c) => upd(key, Boolean(c))} />{label}
                  </label>
                ))}
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={saveMutation.isPending} className="gradient-warm text-primary-foreground border-0">{editingEmployee ? "Update" : "Save Employee"}</Button>
                <Button type="button" variant="outline" onClick={handleCancel}>Cancel</Button>
              </div>
            </form>
          </div>
        </motion.div>
      )}

      {/* Salary Structure Dialog */}
      <Dialog open={Boolean(salaryEmployee)} onOpenChange={(o) => { if (!o) setSalaryEmployee(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><IndianRupee size={16} className="text-primary" />Salary Structure — {salaryEmployee?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              {([["basic", "Basic Salary"], ["hra", "HRA"], ["specialAllowance", "Special Allowance"], ["otherAllowances", "Other Allowances"]] as const).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">{label} (₹/month)</label>
                  <Input type="number" min={0} value={(salaryForm as any)[key] || ""} onChange={(e) => setSalaryForm((f) => ({ ...f, [key]: e.target.value === "" ? 0 : Number(e.target.value) }))} placeholder="0" />
                </div>
              ))}
            </div>
            <div className="px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Gross Salary</span><span className="font-black text-primary">{formatCurrency(salaryGross)}/month</span></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">PF Rate (%)</label><Input type="number" step="0.01" value={salaryForm.pfEmployeeRate || ""} onChange={(e) => setSalaryForm((f) => ({ ...f, pfEmployeeRate: Number(e.target.value) }))} placeholder="12" /></div>
              <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">ESI Rate (%)</label><Input type="number" step="0.01" value={salaryForm.esiEmployeeRate || ""} onChange={(e) => setSalaryForm((f) => ({ ...f, esiEmployeeRate: Number(e.target.value) }))} placeholder="0.75" /></div>
              <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">TDS/month (₹)</label><Input type="number" value={salaryForm.tdsMonthly || ""} onChange={(e) => setSalaryForm((f) => ({ ...f, tdsMonthly: Number(e.target.value) }))} placeholder="0" /></div>
            </div>
            <p className="text-xs text-muted-foreground">TDS monthly amount is provided by your CA based on annual income projection. PF is computed on Basic (capped at ₹15,000).</p>
            <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">Effective From</label><Input type="date" value={salaryForm.effectiveFrom || new Date().toISOString().slice(0, 10)} onChange={(e) => setSalaryForm((f) => ({ ...f, effectiveFrom: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSalaryEmployee(null)}>Cancel</Button>
            <Button className="gradient-warm text-primary-foreground border-0" disabled={salarySaveMutation.isPending} onClick={() => salarySaveMutation.mutate()}>Save Structure</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" className="pl-10" /></div>
        <div className="flex gap-1.5 bg-muted rounded-xl p-1">
          {(["all", "active", "inactive"] as const).map((opt) => (
            <button key={opt} onClick={() => setFilter(opt)} className={`px-4 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${filter === opt ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{opt}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        {isLoading && <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">Loading…</div>}
        {!isLoading && employees.length === 0 && <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">No employees found. Add your first employee to start processing payroll.</div>}
        {employees.map((emp, i) => (
          <motion.div key={emp.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="bg-card rounded-2xl border border-border p-5 shadow-soft hover:shadow-elevated transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h4 className="text-sm font-bold">{emp.name}</h4>
                  {emp.employeeCode && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">{emp.employeeCode}</span>}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${emp.employeeType === 'partner' ? 'bg-primary/10 text-primary' : emp.employeeType === 'consultant' ? 'bg-amber-500/15 text-amber-700' : 'bg-blue-500/10 text-blue-700'}`}>{TYPE_LABELS[emp.employeeType]}</span>
                  <StatusBadge status={emp.active ? "active" : "inactive"} />
                </div>
                <p className="text-xs text-muted-foreground">{emp.designation}{emp.department ? ` · ${emp.department}` : ""}</p>
                <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                  {emp.pfApplicable && <span className="text-success">✓ PF</span>}
                  {emp.esiApplicable && <span className="text-success">✓ ESI</span>}
                  {emp.tdsApplicable && <span className="text-amber-600">✓ TDS</span>}
                  {emp.pan && <span className="font-mono">{emp.pan}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" className="text-xs h-8 gap-1" onClick={() => openSalary(emp)}><IndianRupee size={12} /> Salary</Button>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => handleEdit(emp)}>Edit</Button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
