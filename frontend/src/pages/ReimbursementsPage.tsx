import { type FormEvent, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarIcon, Check, CheckCircle2, ChevronDown, ChevronUp,
  CreditCard, Plus, Search, Trash2, X, LoaderCircle, Receipt,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatCurrency, formatDate } from "@/services/api";
import {
  approveReimbursement, bulkApprove, createReimbursement,
  deleteReimbursement, fetchReimbursements, markReimbursed, rejectReimbursement,
} from "@/services/reimbursements-api";
import type { CreateReimbursementPayload, Reimbursement, ReimbursementCategory } from "@/types/reimbursement";
import { ITC_BLOCKED_CATEGORIES, REIMBURSEMENT_CATEGORY_LABELS } from "@/types/reimbursement";

const today = new Date().toISOString().slice(0, 10);

const defaultForm: CreateReimbursementPayload = {
  paidBy: "", date: today, description: "", category: "other",
  amount: 0, gstAmount: 0, itcEligible: false, receiptReference: "", notes: "",
};

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-amber-500/15 border-amber-500/30 text-amber-700",
  approved:   "bg-blue-500/10 border-blue-500/30 text-blue-700",
  reimbursed: "bg-success/10 border-success/30 text-success",
  rejected:   "bg-destructive/10 border-destructive/30 text-destructive",
};

function DatePickerBtn({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm flex items-center gap-2 text-left focus:outline-none focus:ring-2 focus:ring-ring">
          <CalendarIcon size={14} className="shrink-0 text-muted-foreground" />
          {value ? format(new Date(value + "T00:00:00"), "dd MMM yyyy") : <span className="text-muted-foreground">{placeholder}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value ? new Date(value + "T00:00:00") : undefined}
          onSelect={(date) => { if (date) { const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0"); onChange(`${y}-${m}-${d}`); setOpen(false); } }} initialFocus />
      </PopoverContent>
    </Popover>
  );
}

export default function ReimbursementsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateReimbursementPayload>(defaultForm);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<Reimbursement | null>(null);
  const [reimburseDialog, setReimburseDialog] = useState<Reimbursement | null>(null);
  const [reimburseForm, setReimburseForm] = useState({ reimbursedDate: today, reimbursedAmount: "", paymentReference: "" });

  const { data: reimbursements = [], isLoading } = useQuery({
    queryKey: ["reimbursements", search, filter, personFilter],
    queryFn: () => fetchReimbursements({ search, status: filter, paidBy: personFilter }),
  });

  const people = useMemo(() => [...new Set(reimbursements.map((r) => r.paidBy))].sort(), [reimbursements]);

  const stats = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    return {
      pending: reimbursements.filter((r) => r.status === "pending").reduce((s, r) => s + r.amount, 0),
      approved: reimbursements.filter((r) => r.status === "approved").reduce((s, r) => s + r.amount, 0),
      reimbursedMonth: reimbursements
        .filter((r) => r.status === "reimbursed" && r.reimbursedDate?.startsWith(currentMonth))
        .reduce((s, r) => s + (r.reimbursedAmount ?? r.amount), 0),
      totalItc: reimbursements.filter((r) => r.itcEligible && r.status !== "rejected").reduce((s, r) => s + r.gstAmount, 0),
    };
  }, [reimbursements]);

  const upd = <K extends keyof CreateReimbursementPayload>(k: K, v: CreateReimbursementPayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleCategoryChange = (cat: ReimbursementCategory) => {
    upd("category", cat);
    if (ITC_BLOCKED_CATEGORIES.has(cat)) upd("itcEligible", false);
  };

  const createMutation = useMutation({
    mutationFn: createReimbursement,
    onSuccess: (r) => {
      toast.success(`Recorded — ${r.paidBy}: ${formatCurrency(r.amount)}`);
      qc.invalidateQueries({ queryKey: ["reimbursements"] });
      setForm(defaultForm);
      setShowForm(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Unable to record reimbursement."),
  });

  const approveMutation = useMutation({
    mutationFn: approveReimbursement,
    onSuccess: () => { toast.success("Approved."); qc.invalidateQueries({ queryKey: ["reimbursements"] }); },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Unable to approve."),
  });

  const rejectMutation = useMutation({
    mutationFn: rejectReimbursement,
    onSuccess: () => { toast.success("Rejected."); qc.invalidateQueries({ queryKey: ["reimbursements"] }); },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Unable to reject."),
  });

  const reimburseMutation = useMutation({
    mutationFn: ({ id, ...opts }: { id: string; reimbursedDate: string; reimbursedAmount: number; paymentReference: string }) =>
      markReimbursed(id, opts),
    onSuccess: () => {
      toast.success("Marked as reimbursed.");
      qc.invalidateQueries({ queryKey: ["reimbursements"] });
      setReimburseDialog(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Unable to mark reimbursed."),
  });

  const deleteMutation = useMutation({
    mutationFn: (r: Reimbursement) => deleteReimbursement(r.id),
    onSuccess: () => {
      toast.success("Deleted.");
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["reimbursements"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Unable to delete."),
  });

  const bulkApproveMutation = useMutation({
    mutationFn: () => bulkApprove([...selected]),
    onSuccess: (result) => {
      toast.success(`Approved ${result.count} reimbursements.`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["reimbursements"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Unable to bulk approve."),
  });

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); createMutation.mutate(form); };

  const pendingItems = reimbursements.filter((r) => r.status === "pending");
  const allPendingSelected = pendingItems.length > 0 && pendingItems.every((r) => selected.has(r.id));

  const toggleSelectAll = () => {
    if (allPendingSelected) setSelected(new Set());
    else setSelected(new Set(pendingItems.map((r) => r.id)));
  };

  const FILTER_LABELS: Record<string, string> = {
    all: "All", pending: "Pending", approved: "Approved", reimbursed: "Reimbursed", rejected: "Rejected",
  };

  return (
    <div>
      <PageHeader
        kicker="Expenses"
        title="Reimbursements"
        description="Track out-of-pocket expenses paid by partners and employees — approve and log repayments."
        action={
          <Button onClick={() => setShowForm((v) => !v)} className="gradient-warm text-primary-foreground border-0 shadow-soft hover:shadow-elevated hover:-translate-y-0.5 transition-all">
            <Plus size={16} className="mr-2" /> Add Reimbursement
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Pending Approval", value: formatCurrency(stats.pending), color: "text-amber-600", bg: "bg-amber-500/8" },
          { label: "Approved (To Pay)", value: formatCurrency(stats.approved), color: "text-blue-600", bg: "bg-blue-500/8" },
          { label: "Reimbursed This Month", value: formatCurrency(stats.reimbursedMonth), color: "text-success", bg: "bg-success/8" },
          { label: "ITC Claimable", value: formatCurrency(stats.totalItc), color: "text-primary", bg: "bg-primary/5" },
        ].map((s) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl border border-border p-4 ${s.bg}`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-8 overflow-hidden">
            <div className="bg-card rounded-2xl border border-border shadow-soft p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Receipt size={18} className="text-primary" />
                  <h3 className="text-lg font-bold">Record Reimbursement</h3>
                </div>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-muted"><X size={18} className="text-muted-foreground" /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Paid By</label>
                    <Input value={form.paidBy} onChange={(e) => upd("paidBy", e.target.value)} placeholder="Your name / employee name" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Date</label>
                    <DatePickerBtn value={form.date} onChange={(v) => upd("date", v)} placeholder="Pick date" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Category</label>
                    <Select value={form.category} onValueChange={(v) => handleCategoryChange(v as ReimbursementCategory)}>
                      <SelectTrigger className="rounded-xl h-[46px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(REIMBURSEMENT_CATEGORY_LABELS).map(([k, label]) => (
                          <SelectItem key={k} value={k}>
                            {ITC_BLOCKED_CATEGORIES.has(k as ReimbursementCategory) ? `🚫 ${label}` : label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                    <label className="text-xs font-semibold text-muted-foreground">Description</label>
                    <Input value={form.description} onChange={(e) => upd("description", e.target.value)} placeholder="e.g. Taxi to client office, Indira Nagar" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Amount Paid (₹)</label>
                    <Input type="number" min={0} step="any" value={form.amount || ""} onChange={(e) => upd("amount", e.target.value === "" ? 0 : Number(e.target.value))} placeholder="e.g. 1180" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">GST in Bill (₹) <span className="text-muted-foreground/60">optional</span></label>
                    <Input type="number" min={0} step="any" value={form.gstAmount || ""} onChange={(e) => upd("gstAmount", e.target.value === "" ? 0 : Number(e.target.value))} placeholder="e.g. 180" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Receipt / Bill No</label>
                    <Input value={form.receiptReference} onChange={(e) => upd("receiptReference", e.target.value)} placeholder="Receipt number for audit" />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 mb-4 px-1">
                  <label className={`flex items-center gap-2 text-sm cursor-pointer ${ITC_BLOCKED_CATEGORIES.has(form.category as ReimbursementCategory) ? "opacity-40 pointer-events-none" : ""}`}>
                    <Checkbox checked={form.itcEligible} onCheckedChange={(c) => upd("itcEligible", Boolean(c))} />
                    <span>ITC eligible</span>
                    {ITC_BLOCKED_CATEGORIES.has(form.category as ReimbursementCategory) && (
                      <span className="text-[10px] text-destructive">(blocked under Sec 17(5))</span>
                    )}
                  </label>
                  {form.gstAmount > 0 && form.itcEligible && (
                    <span className="text-xs text-success font-semibold">→ ITC: {formatCurrency(form.gstAmount)}</span>
                  )}
                </div>

                <div className="mb-5">
                  <label className="text-xs font-semibold text-muted-foreground">Notes <span className="text-muted-foreground/60">optional</span></label>
                  <Textarea value={form.notes} onChange={(e) => upd("notes", e.target.value)} rows={2} className="mt-1.5 resize-none" placeholder="Additional context..." />
                </div>

                <div className="flex gap-3">
                  <Button type="submit" disabled={createMutation.isPending} className="gradient-warm text-primary-foreground border-0 shadow-soft">
                    {createMutation.isPending ? <><LoaderCircle size={14} className="animate-spin" /> Saving…</> : "Record Reimbursement"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete dialog */}
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(o) => { if (!o && !deleteMutation.isPending) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete reimbursement</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? `Delete ${pendingDelete.paidBy}'s reimbursement of ${formatCurrency(pendingDelete.amount)} for "${pendingDelete.description}"?` : "Delete this reimbursement?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleteMutation.isPending || !pendingDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (pendingDelete) deleteMutation.mutate(pendingDelete); }}>
              {deleteMutation.isPending ? <LoaderCircle size={14} className="animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark Reimbursed dialog */}
      <Dialog open={Boolean(reimburseDialog)} onOpenChange={(o) => { if (!o) setReimburseDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark as Reimbursed</DialogTitle>
          </DialogHeader>
          {reimburseDialog && (
            <div className="space-y-4 py-2">
              <div className="rounded-xl bg-muted/50 border border-border px-4 py-3 text-sm">
                <p className="font-semibold">{reimburseDialog.paidBy}</p>
                <p className="text-muted-foreground">{reimburseDialog.description}</p>
                <p className="font-bold mt-1">{formatCurrency(reimburseDialog.amount)}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Payment Date</label>
                <DatePickerBtn value={reimburseForm.reimbursedDate} onChange={(v) => setReimburseForm((f) => ({ ...f, reimbursedDate: v }))} placeholder="Payment date" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Amount Paid (₹)</label>
                <Input type="number" min={0} step="any"
                  value={reimburseForm.reimbursedAmount}
                  onChange={(e) => setReimburseForm((f) => ({ ...f, reimbursedAmount: e.target.value }))}
                  placeholder={String(reimburseDialog.amount)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Bank Transfer Reference / UTR</label>
                <Input value={reimburseForm.paymentReference} onChange={(e) => setReimburseForm((f) => ({ ...f, paymentReference: e.target.value }))} placeholder="UTR / NEFT ref" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReimburseDialog(null)}>Cancel</Button>
            <Button className="gradient-warm text-primary-foreground border-0"
              disabled={reimburseMutation.isPending || !reimburseDialog}
              onClick={() => {
                if (!reimburseDialog) return;
                reimburseMutation.mutate({
                  id: reimburseDialog.id,
                  reimbursedDate: reimburseForm.reimbursedDate,
                  reimbursedAmount: reimburseForm.reimbursedAmount ? Number(reimburseForm.reimbursedAmount) : reimburseDialog.amount,
                  paymentReference: reimburseForm.paymentReference,
                });
              }}>
              {reimburseMutation.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <><CreditCard size={14} /> Confirm Payment</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filters + bulk actions */}
      <div className="flex flex-col lg:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search description or person..." className="pl-10" />
        </div>
        {people.length > 1 && (
          <Select value={personFilter} onValueChange={setPersonFilter}>
            <SelectTrigger className="w-[160px] rounded-xl h-10 text-sm"><SelectValue placeholder="All people" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All people</SelectItem>
              {people.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="flex gap-1.5 bg-muted rounded-xl p-1 overflow-x-auto">
          {Object.entries(FILTER_LABELS).map(([status, label]) => (
            <button key={status} onClick={() => setFilter(status)} className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${filter === status ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk approve bar */}
      {pendingItems.length > 0 && (filter === "all" || filter === "pending") && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <Checkbox checked={allPendingSelected} onCheckedChange={toggleSelectAll} />
            <span className="font-medium">{selected.size > 0 ? `${selected.size} selected` : `${pendingItems.length} pending`}</span>
          </label>
          {selected.size > 0 && (
            <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white border-0" disabled={bulkApproveMutation.isPending} onClick={() => bulkApproveMutation.mutate()}>
              {bulkApproveMutation.isPending ? <LoaderCircle size={12} className="animate-spin" /> : <><Check size={12} /> Approve {selected.size} Selected</>}
            </Button>
          )}
        </div>
      )}

      {/* List */}
      <div className="grid gap-2">
        {isLoading && <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">Loading reimbursements…</div>}
        {!isLoading && reimbursements.length === 0 && (
          <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">
            No reimbursements yet. Click Add Reimbursement to record the first one.
          </div>
        )}
        {reimbursements.map((r, i) => {
          const isExpanded = expandedId === r.id;
          const isPending = r.status === "pending";
          const isApproved = r.status === "approved";
          return (
            <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className={`rounded-2xl border transition-all duration-200 overflow-hidden ${STATUS_COLORS[r.status] ?? "border-border bg-card"} bg-card`}>
              <div className="flex items-center gap-3 px-5 py-4">
                {/* Select checkbox for pending */}
                {isPending && (
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={(c) => setSelected((prev) => { const next = new Set(prev); c ? next.add(r.id) : next.delete(r.id); return next; })} onClick={(e) => e.stopPropagation()} />
                )}

                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="text-sm font-bold">{r.paidBy}</span>
                    <StatusBadge status={r.status} />
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                      {REIMBURSEMENT_CATEGORY_LABELS[r.category] ?? r.category}
                    </span>
                    {r.itcEligible && r.gstAmount > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success font-semibold">ITC {formatCurrency(r.gstAmount)}</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{r.description} · {formatDate(r.date)}</p>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-base font-black">{formatCurrency(r.amount)}</span>
                  {isPending && (
                    <Button size="sm" variant="outline" className="h-8 text-xs border-blue-500/40 text-blue-600 hover:bg-blue-500/5" disabled={approveMutation.isPending} onClick={(e) => { e.stopPropagation(); approveMutation.mutate(r.id); }}>
                      <Check size={12} /> Approve
                    </Button>
                  )}
                  {isApproved && (
                    <Button size="sm" className="h-8 text-xs bg-success text-white border-0 hover:bg-success/90" onClick={(e) => { e.stopPropagation(); setReimburseForm({ reimbursedDate: today, reimbursedAmount: "", paymentReference: "" }); setReimburseDialog(r); }}>
                      <CreditCard size={12} /> Reimburse
                    </Button>
                  )}
                  {r.status === "reimbursed" && (
                    <CheckCircle2 size={18} className="text-success" />
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : r.id); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="border-t border-border/50 px-5 py-4 bg-muted/20 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Receipt / Bill No</p>
                        <p className="font-medium">{r.receiptReference || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">GST in Bill</p>
                        <p className="font-medium">{r.gstAmount > 0 ? formatCurrency(r.gstAmount) : "—"}</p>
                      </div>
                      {r.status === "reimbursed" && (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Reimbursed On</p>
                            <p className="font-medium">{r.reimbursedDate ? formatDate(r.reimbursedDate) : "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Payment Ref</p>
                            <p className="font-medium font-mono text-xs">{r.paymentReference || "—"}</p>
                          </div>
                        </>
                      )}
                      {r.notes && (
                        <div className="sm:col-span-2 lg:col-span-4">
                          <p className="text-xs text-muted-foreground mb-1">Notes</p>
                          <p className="text-muted-foreground italic">{r.notes}</p>
                        </div>
                      )}
                    </div>
                    <div className="border-t border-border/50 px-5 py-3 flex gap-2 bg-muted/10">
                      {isPending && (
                        <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30" disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate(r.id)}>
                          Reject
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => setPendingDelete(r)}>
                        <Trash2 size={12} /> Delete
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
