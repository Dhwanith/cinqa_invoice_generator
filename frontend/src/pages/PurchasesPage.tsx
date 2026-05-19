import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownUp, CalendarIcon, Search, X, Trash2, LoaderCircle, TrendingDown, Download } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fetchPurchaseDetail, fetchPurchases, deletePurchase, updatePurchaseStatus } from "@/services/purchases-api";
import { downloadCsv, PURCHASE_CSV_HEADERS, purchaseToRow } from "@/lib/export";
import { formatCurrency, formatDate } from "@/services/api";
import type { Purchase } from "@/types/purchase";
import { PURCHASE_CATEGORY_LABELS, computeItcClaimable } from "@/types/purchase";

type SortOption = "newest" | "oldest" | "amount-high" | "amount-low" | "vendor-asc";

const STATUS_LABELS: Record<string, string> = {
  all: "All", draft: "Draft", booked: "Booked", paid: "Paid", cancelled: "Cancelled",
};

const STATUS_TRIGGER: Record<string, string> = {
  draft:     "border-muted-foreground/30 text-muted-foreground bg-muted/5",
  booked:    "border-blue-500 text-blue-600 bg-blue-500/5",
  paid:      "border-success text-success bg-success/5",
  cancelled: "border-destructive text-destructive bg-destructive/5",
};

const ITC_TYPE_LABELS: Record<string, string> = {
  full: "Full ITC", restricted: "50% ITC", blocked: "No ITC",
};

export default function PurchasesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Purchase | null>(null);

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["purchases", search, filter, dateFrom, dateTo],
    queryFn: () => fetchPurchases({ search, status: filter, dateFrom, dateTo }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updatePurchaseStatus(id, status),
    onSuccess: (p) => {
      toast.success(`Marked as ${p.status}.`);
      qc.invalidateQueries({ queryKey: ["purchases"] });
      if (selectedPurchase?.id === p.id) setSelectedPurchase({ ...selectedPurchase, ...p });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Unable to update status."),
  });

  const deleteMutation = useMutation({
    mutationFn: (p: Purchase) => deletePurchase(p.id),
    onSuccess: (result) => {
      toast.success(`Deleted ${result.vendorName}.`);
      setPendingDelete(null);
      setSelectedPurchase(null);
      qc.invalidateQueries({ queryKey: ["purchases"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Unable to delete purchase."),
  });

  const loadDetail = async (purchaseId: string) => {
    try {
      const p = await fetchPurchaseDetail(purchaseId);
      setSelectedPurchase(p);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load purchase.");
    }
  };

  const sorted = useMemo(() => {
    const dateVal = (v: string) => { const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; };
    return [...purchases].sort((a, b) => {
      switch (sortBy) {
        case "oldest":      return dateVal(a.purchaseDate) - dateVal(b.purchaseDate);
        case "amount-high": return b.total - a.total;
        case "amount-low":  return a.total - b.total;
        case "vendor-asc":  return a.vendorName.localeCompare(b.vendorName);
        default:            return dateVal(b.purchaseDate) - dateVal(a.purchaseDate);
      }
    });
  }, [purchases, sortBy]);

  // Summary stats
  const stats = useMemo(() => {
    const active = purchases.filter((p) => p.status !== "cancelled");
    return {
      totalPayable: active.reduce((s, p) => s + p.total, 0),
      totalItc: active.reduce((s, p) => s + computeItcClaimable(p), 0),
      unpaid: active.filter((p) => p.status !== "paid").length,
    };
  }, [purchases]);

  const datePickBtn = (value: string, open: boolean, setOpen: (v: boolean) => void, setVal: (v: string) => void, placeholder: string) => (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
          <CalendarIcon size={12} />
          {value ? format(new Date(value + "T00:00:00"), "dd MMM yyyy") : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value ? new Date(value + "T00:00:00") : undefined}
          onSelect={(date) => { if (date) { const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0"); setVal(`${y}-${m}-${d}`); setOpen(false); } }} initialFocus />
      </PopoverContent>
    </Popover>
  );

  return (
    <div>
      <PageHeader
        kicker="Purchases"
        title="Purchase Register"
        description="All vendor invoices, GST inputs, and ITC tracking in one place."
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => downloadCsv(`purchases-${new Date().toISOString().slice(0,10)}.csv`, PURCHASE_CSV_HEADERS, sorted.map(purchaseToRow))}>
              <Download size={13} /> Export CSV
            </Button>
            <Link to="/purchases/new">
              <Button className="gradient-warm text-primary-foreground border-0 shadow-soft hover:shadow-elevated hover:-translate-y-0.5 transition-all">
                New Purchase
              </Button>
            </Link>
          </div>
        }
      />

      {/* Stats bar */}
      {purchases.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Payable", value: formatCurrency(stats.totalPayable), sub: `${stats.unpaid} unpaid` },
            { label: "ITC Claimable", value: formatCurrency(stats.totalItc), sub: "from eligible purchases" },
            { label: "Net Cost", value: formatCurrency(stats.totalPayable - stats.totalItc), sub: "after ITC offset" },
          ].map((s) => (
            <div key={s.label} className="bg-card rounded-2xl border border-border p-4 shadow-soft">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={14} className="text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl font-black tracking-tight">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Delete dialog */}
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(o) => { if (!o && !deleteMutation.isPending) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete purchase</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? `Delete ${pendingDelete.vendorName} — ${formatCurrency(pendingDelete.total)}? This will also remove all line items.` : "Delete this purchase?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleteMutation.isPending || !pendingDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (pendingDelete) deleteMutation.mutate(pendingDelete); }}>
              {deleteMutation.isPending ? <><LoaderCircle size={14} className="animate-spin" /> Deleting…</> : <><Trash2 size={14} /> Delete</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail panel */}
      <AnimatePresence>
        {selectedPurchase && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm px-4 py-8 overflow-y-auto" onClick={() => setSelectedPurchase(null)}>
            <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.2 }}
              className="max-w-3xl mx-auto bg-card rounded-3xl border border-border shadow-elevated p-6 md:p-7" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-primary font-semibold mb-2">Purchase Detail</p>
                  <h3 className="text-2xl font-black tracking-tight">{selectedPurchase.vendorName}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedPurchase.purchaseNumber && `${selectedPurchase.purchaseNumber} · `}
                    {PURCHASE_CATEGORY_LABELS[selectedPurchase.category] ?? selectedPurchase.category}
                  </p>
                </div>
                <button onClick={() => setSelectedPurchase(null)} className="p-2 rounded-xl hover:bg-muted transition-colors"><X size={18} /></button>
              </div>

              <div className="grid sm:grid-cols-4 gap-3 mb-6">
                {[
                  { label: selectedPurchase.status === "paid" ? "Paid Date" : "Invoice Date", value: formatDate(selectedPurchase.purchaseDate) },
                  { label: "Due", value: selectedPurchase.dueDate ? formatDate(selectedPurchase.dueDate) : "—" },
                  { label: "GST Type", value: selectedPurchase.gstType || "—" },
                  { label: "Status", value: <StatusBadge status={selectedPurchase.status} /> },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-2xl border border-border p-4">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <div className="font-semibold text-sm">{value}</div>
                  </div>
                ))}
              </div>

              {/* ITC info strip */}
              <div className="rounded-2xl bg-blue-500/5 border border-blue-500/20 px-4 py-3 mb-5 flex flex-wrap gap-4 text-sm">
                <div><span className="text-muted-foreground">ITC Type: </span><span className="font-semibold">{ITC_TYPE_LABELS[selectedPurchase.itcType]}</span></div>
                <div><span className="text-muted-foreground">ITC Claimable: </span><span className="font-bold text-success">{formatCurrency(computeItcClaimable(selectedPurchase))}</span></div>
                {selectedPurchase.isRcm && <div className="text-amber-600 font-semibold">⚠️ Reverse Charge</div>}
              </div>

              {/* Line items */}
              {(selectedPurchase.lineItems || []).length > 0 && (
                <div className="rounded-2xl border border-border overflow-hidden mb-5">
                  <div className="grid grid-cols-[1fr,80px,80px,100px,100px] px-4 py-3 bg-muted/50 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    <div>Description</div>
                    <div className="text-right">GST%</div>
                    <div className="text-right">Taxable</div>
                    <div className="text-right">GST</div>
                    <div className="text-right">Total</div>
                  </div>
                  {(selectedPurchase.lineItems || []).map((li) => (
                    <div key={li.lineNumber} className="grid grid-cols-[1fr,80px,80px,100px,100px] px-4 py-3 border-t border-border text-sm">
                      <div>
                        <p className="font-medium">{li.description}</p>
                        {li.hsnSac && <p className="text-xs text-muted-foreground">{li.hsnSac}</p>}
                      </div>
                      <div className="text-right text-muted-foreground">{li.gstRate}%</div>
                      <div className="text-right font-semibold">{formatCurrency(li.amount)}</div>
                      <div className="text-right font-semibold">{formatCurrency(li.cgst + li.sgst + li.igst)}</div>
                      <div className="text-right font-semibold">{formatCurrency(li.total)}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tax summary */}
              <div className="grid sm:grid-cols-2 gap-4 mb-5">
                <div className="rounded-2xl border border-border p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">Tax Breakdown</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Taxable Value</span><span className="font-semibold">{formatCurrency(selectedPurchase.amount)}</span></div>
                    {selectedPurchase.cgst > 0 && <div className="flex justify-between"><span>CGST</span><span className="font-semibold">{formatCurrency(selectedPurchase.cgst)}</span></div>}
                    {selectedPurchase.sgst > 0 && <div className="flex justify-between"><span>SGST</span><span className="font-semibold">{formatCurrency(selectedPurchase.sgst)}</span></div>}
                    {selectedPurchase.igst > 0 && <div className="flex justify-between"><span>IGST</span><span className="font-semibold">{formatCurrency(selectedPurchase.igst)}</span></div>}
                    <div className="h-px bg-border" />
                    <div className="flex justify-between text-base"><span className="font-semibold">Total</span><span className="font-black">{formatCurrency(selectedPurchase.total)}</span></div>
                  </div>
                </div>
                <div className="rounded-2xl border border-border p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">Vendor</p>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-muted-foreground">GSTIN: </span>{selectedPurchase.vendorGstin || "Not registered"}</p>
                    <p><span className="text-muted-foreground">State Code: </span>{selectedPurchase.vendorStateCode || "—"}</p>
                    {selectedPurchase.paymentDate && <p><span className="text-muted-foreground">Paid: </span>{formatDate(selectedPurchase.paymentDate)}</p>}
                    {selectedPurchase.paymentReference && <p><span className="text-muted-foreground">Ref: </span>{selectedPurchase.paymentReference}</p>}
                  </div>
                </div>
              </div>

              {selectedPurchase.notes && (
                <p className="text-xs text-muted-foreground italic mb-4">{selectedPurchase.notes}</p>
              )}

              <div className="flex flex-wrap gap-2">
                <Select value={selectedPurchase.status} onValueChange={(v) => statusMutation.mutate({ id: selectedPurchase.id, status: v })} disabled={statusMutation.isPending}>
                  <SelectTrigger className={`h-8 w-36 text-xs font-semibold ${STATUS_TRIGGER[selectedPurchase.status] ?? ""}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="text-xs h-8 gap-1 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive" onClick={() => setPendingDelete(selectedPurchase)}>
                  <Trash2 size={12} /> Delete
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendor or invoice number..." className="pl-10" />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {datePickBtn(dateFrom, fromOpen, setFromOpen, setDateFrom, "From date")}
          {datePickBtn(dateTo, toOpen, setToOpen, setDateTo, "To date")}
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors">Clear dates</button>
          )}
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-auto rounded-xl border border-border bg-card text-sm h-10 px-3 gap-2 shadow-none">
            <span className="flex items-center gap-2"><ArrowDownUp size={14} className="text-muted-foreground shrink-0" /><SelectValue /></span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="amount-high">Amount: high → low</SelectItem>
            <SelectItem value="amount-low">Amount: low → high</SelectItem>
            <SelectItem value="vendor-asc">Vendor: A → Z</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1.5 bg-muted rounded-xl p-1 overflow-x-auto">
          {Object.entries(STATUS_LABELS).map(([status, label]) => (
            <button key={status} onClick={() => setFilter(status)} className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${filter === status ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="grid gap-3">
        {isLoading && <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">Loading purchases…</div>}
        {!isLoading && sorted.length === 0 && (
          <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">
            {purchases.length === 0 ? "No purchases recorded yet. Click New Purchase to add the first one." : "No purchases match the current filter."}
          </div>
        )}
        {sorted.map((purchase, index) => (
          <motion.div key={purchase.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
            className="bg-card rounded-2xl border border-border p-5 shadow-soft hover:shadow-elevated transition-all duration-200">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  <h4 className="text-sm font-bold">{purchase.vendorName}</h4>
                  <StatusBadge status={purchase.status} />
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">{PURCHASE_CATEGORY_LABELS[purchase.category] ?? purchase.category}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {purchase.purchaseNumber && `${purchase.purchaseNumber} · `}
                  {formatDate(purchase.purchaseDate)}
                  {purchase.dueDate && ` · Due ${formatDate(purchase.dueDate)}`}
                </p>
                {purchase.itcEligible && (
                  <p className="text-xs text-success mt-0.5">ITC {formatCurrency(computeItcClaimable(purchase))}</p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap lg:flex-nowrap">
                <div className="text-right min-w-[128px]">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Total</p>
                  <p className="text-lg font-black">{formatCurrency(purchase.total)}</p>
                </div>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => loadDetail(purchase.id)}>View</Button>
                <Select value={purchase.status} onValueChange={(v) => statusMutation.mutate({ id: purchase.id, status: v })} disabled={statusMutation.isPending}>
                  <SelectTrigger className={`h-8 w-32 text-xs font-semibold ${STATUS_TRIGGER[purchase.status] ?? ""}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="text-xs h-8 gap-1 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => setPendingDelete(purchase)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
