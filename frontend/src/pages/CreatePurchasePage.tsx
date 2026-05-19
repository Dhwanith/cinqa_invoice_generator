import { type FormEvent, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarIcon, Check, ChevronsUpDown, LoaderCircle, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { fetchVendors, createPurchase } from "@/services/purchases-api";
import { formatCurrency } from "@/services/api";
import type { ItcType, PurchaseCategory, PurchaseLineItem } from "@/types/purchase";
import { PURCHASE_CATEGORY_LABELS, GST_RATES, calculateLineGst, computeItcClaimable } from "@/types/purchase";

const COMPANY_STATE_CODE = 24;

interface LineItemForm {
  description: string;
  hsnSac: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
  gstRate: number;
}

const emptyLine = (): LineItemForm => ({
  description: "", hsnSac: "", quantity: null, unitPrice: null, amount: 0, gstRate: 18,
});

export default function CreatePurchasePage() {
  const today = new Date().toISOString().slice(0, 10);

  const { data: vendors = [], isLoading: vendorsLoading } = useQuery({
    queryKey: ["vendors", "active"],
    queryFn: () => fetchVendors({ active: "active" }),
  });

  const [vendorId, setVendorId] = useState("");
  const [vendorOpen, setVendorOpen] = useState(false);
  const [purchaseNumber, setPurchaseNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [dateOpen, setDateOpen] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [category, setCategory] = useState<PurchaseCategory>("other");
  const [itcType, setItcType] = useState<ItcType>("full");
  const [isRcm, setIsRcm] = useState(false);
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItemForm[]>([emptyLine()]);
  const [submittedPurchase, setSubmittedPurchase] = useState<{ id: string; vendorName: string; total: number } | null>(null);

  const selectedVendor = vendors.find((v) => v.id === vendorId);

  useEffect(() => {
    if (vendors.length && !vendorId) setVendorId(vendors[0]?.id || "");
  }, [vendors, vendorId]);

  const computedLines = useMemo(() =>
    lineItems.map((li) => {
      const gst = calculateLineGst(li.amount, li.gstRate, selectedVendor?.stateCode || 0, COMPANY_STATE_CODE);
      return { ...li, ...gst };
    }),
    [lineItems, selectedVendor]
  );

  const totals = useMemo(() =>
    computedLines.reduce((acc, li) => ({
      amount: acc.amount + li.amount,
      cgst: acc.cgst + li.cgst,
      sgst: acc.sgst + li.sgst,
      igst: acc.igst + li.igst,
      total: acc.total + li.total,
    }), { amount: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }),
    [computedLines]
  );

  const itcClaimable = useMemo(() => {
    const totalGst = totals.cgst + totals.sgst + totals.igst;
    if (!selectedVendor?.gstin || itcType === "blocked") return 0;
    if (itcType === "restricted") return Math.round(totalGst * 0.5 * 100) / 100;
    return totalGst;
  }, [totals, itcType, selectedVendor]);

  const gstType = useMemo(() => {
    if (!selectedVendor?.gstin || !selectedVendor.stateCode) return "NONE";
    return selectedVendor.stateCode === COMPANY_STATE_CODE ? "CGST/SGST" : "IGST";
  }, [selectedVendor]);

  const updateLine = (index: number, field: keyof LineItemForm, value: string | number | null) => {
    setLineItems((prev) => prev.map((li, i) => {
      if (i !== index) return li;
      const updated = { ...li, [field]: typeof value === "string" && (field === "amount" || field === "quantity" || field === "unitPrice" || field === "gstRate") ? Number(value) : value };
      if (field === "quantity" || field === "unitPrice") {
        const q = field === "quantity" ? Number(value) : (updated.quantity || 0);
        const p = field === "unitPrice" ? Number(value) : (updated.unitPrice || 0);
        if (q && p) updated.amount = Math.round(q * p * 100) / 100;
      }
      return updated;
    }));
  };

  const createMutation = useMutation({
    mutationFn: createPurchase,
    onSuccess: (purchase) => {
      setSubmittedPurchase({ id: purchase.id, vendorName: purchase.vendorName, total: purchase.total });
      toast.success(`Purchase recorded — ${purchase.vendorName}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Unable to record purchase."),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!vendorId) { toast.error("Select a vendor."); return; }
    const linesForApi: Omit<PurchaseLineItem, "id" | "purchaseId">[] = computedLines.map((li, index) => ({
      lineNumber: index + 1,
      description: li.description,
      hsnSac: li.hsnSac,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      amount: li.amount,
      gstRate: li.gstRate,
      cgst: li.cgst,
      sgst: li.sgst,
      igst: li.igst,
      total: li.total,
    }));
    createMutation.mutate({ vendorId, purchaseNumber, purchaseDate, dueDate, category, itcType, isRcm, notes, lineItems: linesForApi });
  };

  const dateBtn = (value: string, open: boolean, setOpen: (v: boolean) => void, setVal: (v: string) => void, placeholder: string) => (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm flex items-center gap-2 text-left focus:outline-none focus:ring-2 focus:ring-ring">
          <CalendarIcon size={14} className="shrink-0 text-muted-foreground" />
          {value ? format(new Date(value + "T00:00:00"), "dd MMM yyyy") : <span className="text-muted-foreground">{placeholder}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value ? new Date(value + "T00:00:00") : undefined}
          onSelect={(date) => { if (date) { const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0"); setVal(`${y}-${m}-${d}`); setOpen(false); } }}
          initialFocus />
      </PopoverContent>
    </Popover>
  );

  return (
    <div>
      <PageHeader kicker="Purchases" title="Record Purchase" description="Log a vendor invoice — the amount, GST breakdown, and ITC eligibility." />
      <form onSubmit={handleSubmit} className="grid xl:grid-cols-[1.3fr,0.7fr] gap-6 items-start">
        <div className="space-y-6">

          {/* Purchase Details */}
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-3xl border border-border shadow-soft p-6 md:p-7">
            <h3 className="text-lg font-bold mb-5">Purchase Details</h3>
            <div className="grid sm:grid-cols-2 gap-4">

              {/* Vendor selector */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">Vendor</label>
                <Popover open={vendorOpen} onOpenChange={setVendorOpen}>
                  <PopoverTrigger asChild>
                    <button type="button" role="combobox" className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-ring">
                      <span className={cn("truncate", !selectedVendor && "text-muted-foreground")}>
                        {selectedVendor ? selectedVendor.name : vendorsLoading ? "Loading…" : "Select vendor…"}
                      </span>
                      <ChevronsUpDown size={14} className="ml-2 shrink-0 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                    <Command>
                      <CommandInput placeholder="Search vendors…" />
                      <CommandList>
                        <CommandEmpty>No vendors found.</CommandEmpty>
                        <CommandGroup>
                          {vendors.map((v) => (
                            <CommandItem key={v.id} value={v.name} onSelect={() => { setVendorId(v.id); setVendorOpen(false); }}>
                              <Check size={13} className={cn("mr-2 shrink-0", vendorId === v.id ? "opacity-100" : "opacity-0")} />
                              <div className="flex-1 min-w-0">
                                <span>{v.name}</span>
                                {v.gstin && <span className="ml-2 text-xs text-muted-foreground">{v.gstin}</span>}
                              </div>
                              <span className="ml-2 text-xs text-muted-foreground">{v.state} ({v.stateCode})</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedVendor && (
                  <div className="mt-2 rounded-xl bg-muted/50 border border-border px-4 py-3 flex flex-wrap gap-4 text-sm">
                    <span><span className="text-muted-foreground">GSTIN: </span><span className="font-semibold">{selectedVendor.gstin || "Not registered"}</span></span>
                    <span><span className="text-muted-foreground">GST Mode: </span><span className="font-semibold text-primary">{gstType}</span></span>
                    <span><span className="text-muted-foreground">ITC: </span><span className={cn("font-semibold", selectedVendor.gstin ? "text-success" : "text-muted-foreground")}>{selectedVendor.gstin ? "Eligible" : "Not eligible (no GSTIN)"}</span></span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Vendor Invoice No</label>
                <Input value={purchaseNumber} onChange={(e) => setPurchaseNumber(e.target.value)} placeholder="e.g. INV-2026-001" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Category</label>
                <Select value={category} onValueChange={(v) => setCategory(v as PurchaseCategory)}>
                  <SelectTrigger className="rounded-xl h-[46px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PURCHASE_CATEGORY_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Invoice Date</label>
                {dateBtn(purchaseDate, dateOpen, setDateOpen, setPurchaseDate, "Pick date")}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Due Date <span className="text-muted-foreground/60">(optional)</span></label>
                {dateBtn(dueDate, dueDateOpen, setDueDateOpen, setDueDate, "Pick date")}
              </div>
            </div>
          </motion.div>

          {/* Line Items */}
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-3xl border border-border shadow-soft p-6 md:p-7">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">Line Items</h3>
              <Button type="button" onClick={() => setLineItems((p) => [...p, emptyLine()])} variant="outline" className="rounded-xl">
                <Plus size={14} className="mr-2" /> Add Item
              </Button>
            </div>
            <div className="space-y-4">
              {lineItems.map((li, index) => {
                const comp = computedLines[index];
                return (
                  <div key={index} className="rounded-2xl border border-border p-4 space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Description</label>
                      <Input value={li.description} onChange={(e) => updateLine(index, "description", e.target.value)} placeholder="e.g. AWS EC2 - May 2026" required />
                    </div>
                    <div className="grid sm:grid-cols-[120px,80px,1fr,120px,100px,44px] gap-3 items-end">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">HSN/SAC</label>
                        <Input value={li.hsnSac} onChange={(e) => updateLine(index, "hsnSac", e.target.value)} placeholder="Optional" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Qty</label>
                        <Input type="number" min={0} step="any" value={li.quantity ?? ""} onChange={(e) => updateLine(index, "quantity", e.target.value === "" ? null : e.target.value)} placeholder="–" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Taxable Amount (₹)</label>
                        <Input type="number" min={0} step="any" value={li.amount || ""} onChange={(e) => updateLine(index, "amount", e.target.value)} placeholder="e.g. 10000" required />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">GST Rate</label>
                        <Select value={String(li.gstRate)} onValueChange={(v) => updateLine(index, "gstRate", Number(v))}>
                          <SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {GST_RATES.map((r) => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Total</label>
                        <div className="h-11 px-3 rounded-xl border border-input bg-muted/40 text-sm flex items-center font-semibold text-right">
                          {formatCurrency(comp?.total || 0)}
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setLineItems((p) => p.filter((_, i) => i !== index))} disabled={lineItems.length === 1} className="rounded-xl text-muted-foreground hover:text-destructive mt-[22px]">
                        <Trash2 size={16} />
                      </Button>
                    </div>
                    {comp && (comp.cgst > 0 || comp.sgst > 0 || comp.igst > 0) && (
                      <div className="flex gap-4 text-xs text-muted-foreground px-1">
                        {comp.cgst > 0 && <span>CGST {formatCurrency(comp.cgst)}</span>}
                        {comp.sgst > 0 && <span>SGST {formatCurrency(comp.sgst)}</span>}
                        {comp.igst > 0 && <span>IGST {formatCurrency(comp.igst)}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* Right Panel */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="space-y-5 sticky top-24">

          {/* ITC Settings */}
          <div className="bg-card rounded-3xl border border-border shadow-soft p-6">
            <h3 className="text-lg font-bold mb-4">ITC Settings</h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">ITC Eligibility</label>
                <Select value={itcType} onValueChange={(v) => setItcType(v as ItcType)}>
                  <SelectTrigger className="rounded-xl h-[46px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">✅ Full ITC — 100% claimable</SelectItem>
                    <SelectItem value="restricted">⚠️ Restricted — 50% claimable</SelectItem>
                    <SelectItem value="blocked">🚫 Blocked — No ITC (Sec 17(5))</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border p-3">
                <Checkbox checked={isRcm} onCheckedChange={(c) => setIsRcm(Boolean(c))} className="mt-0.5" />
                <div>
                  <span className="text-sm font-medium">Reverse Charge (RCM)</span>
                  <p className="text-xs text-muted-foreground mt-0.5">You pay the GST directly to the government</p>
                </div>
              </label>
            </div>
          </div>

          {/* Tax Summary */}
          <div className="bg-card rounded-3xl border border-border shadow-soft p-6">
            <h3 className="text-lg font-bold mb-4">Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Taxable Value</span><span className="font-semibold">{formatCurrency(totals.amount)}</span></div>
              {totals.cgst > 0 && <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span className="font-semibold">{formatCurrency(totals.cgst)}</span></div>}
              {totals.sgst > 0 && <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span className="font-semibold">{formatCurrency(totals.sgst)}</span></div>}
              {totals.igst > 0 && <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span className="font-semibold">{formatCurrency(totals.igst)}</span></div>}
              <div className="h-px bg-border" />
              <div className="flex justify-between text-base"><span className="font-semibold">Total Payable</span><span className="font-black text-foreground">{formatCurrency(totals.total)}</span></div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">ITC Claimable</span>
                <span className={cn("font-bold", itcClaimable > 0 ? "text-success" : "text-muted-foreground")}>{formatCurrency(itcClaimable)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Net Cost (after ITC)</span>
                <span className="font-semibold">{formatCurrency(totals.total - itcClaimable)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-card rounded-3xl border border-border shadow-soft p-6">
            <h3 className="text-base font-bold mb-3">Notes</h3>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="resize-none" placeholder="Internal notes, payment ref, etc." />
          </div>

          <Button type="submit" disabled={createMutation.isPending || !vendorId || vendorsLoading} className="w-full gradient-warm text-primary-foreground border-0 shadow-soft hover:shadow-elevated transition-all py-6 text-base">
            {createMutation.isPending ? <><LoaderCircle size={18} className="animate-spin" /> Recording…</> : "Record Purchase"}
          </Button>

          {submittedPurchase && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-success/20 bg-success/5 px-4 py-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={18} className="text-success mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-success font-semibold mb-1">Recorded</p>
                  <p className="text-sm font-bold">{submittedPurchase.vendorName}</p>
                  <p className="text-sm text-muted-foreground">{formatCurrency(submittedPurchase.total)} booked successfully.</p>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </form>
    </div>
  );
}
