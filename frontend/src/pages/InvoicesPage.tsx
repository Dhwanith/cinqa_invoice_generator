import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownUp, CalendarIcon, Search, X, FileDown, Eye, LoaderCircle, Trash2, Download } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { deleteInvoice, fetchInvoiceDetail, fetchInvoices, formatCurrency, formatDate, updateInvoiceStatus } from "@/services/api";
import { downloadCsv, INVOICE_CSV_HEADERS, invoiceToRow } from "@/lib/export";
import type { Invoice } from "@/types/invoice";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import InvoicePdfPreview from "@/components/InvoicePdfPreview";
import { downloadInvoicePdf } from "@/services/invoicePdf";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { convertProformaToTaxInvoice } from "@/services/api";

type InvoiceSortOption = "newest" | "oldest" | "amount-high" | "amount-low" | "invoice-asc" | "invoice-desc" | "client-asc" | "client-desc";

const STATUS_TRIGGER_CLASSES: Record<string, string> = {
  pending:        "border-amber-500 text-amber-600 bg-amber-500/5",
  sent:           "border-primary text-primary bg-primary/5",
  partially_paid: "border-orange-500 text-orange-600 bg-orange-500/5",
  paid:           "border-success text-success bg-success/5",
  cancelled:      "border-destructive text-destructive bg-destructive/5",
  converted:      "border-violet-500 text-violet-600 bg-violet-500/5",
};

const STATUS_LABELS: Record<string, string> = {
  all:            "All",
  generated:      "Generated",
  pending:        "Pending",
  sent:           "Sent",
  partially_paid: "Partially Paid",
  paid:           "Paid",
  cancelled:      "Cancelled",
  converted:      "Converted",
};

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState<InvoiceSortOption>("newest");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [pdfPreviewInvoice, setPdfPreviewInvoice] = useState<Invoice | null>(null);
  const [invoicePendingDelete, setInvoicePendingDelete] = useState<Invoice | null>(null);
  const [invoicePendingConversion, setInvoicePendingConversion] = useState<Invoice | null>(null);
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [purchaseOrderDate, setPurchaseOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [poDateOpen, setPoDateOpen] = useState(false);
  const [lineItemSacs, setLineItemSacs] = useState<string[]>([]);
  const [bulkSac, setBulkSac] = useState("");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", search, filter],
    queryFn: () => fetchInvoices({ search, status: filter }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ invoiceId, status }: { invoiceId: string; status: string }) => updateInvoiceStatus(invoiceId, status),
    onSuccess: (invoice) => {
      toast.success(`${invoice.invoiceNo} updated to ${invoice.status}.`);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (selectedInvoice?.id === invoice.id) {
        setSelectedInvoice({ ...selectedInvoice, ...invoice });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update invoice status.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (invoice: Invoice) => deleteInvoice(invoice.id),
    onSuccess: (result) => {
      toast.success(`${result.invoiceNo} deleted. Removed ${result.deletedLineItems} line items as well.`);
      setInvoicePendingDelete(null);
      setSelectedInvoice(null);
      setPdfPreviewInvoice(null);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to delete invoice.");
    },
  });

  const convertMutation = useMutation({
    mutationFn: ({ invoiceId, payload }: { invoiceId: string; payload: { purchaseOrderNumber: string; purchaseOrderDate: string; lineItemSacs?: string[] } }) =>
      convertProformaToTaxInvoice(invoiceId, payload),
    onSuccess: (invoice) => {
      toast.success(invoice.invoiceNo ? `Created ${invoice.invoiceNo}.` : "Tax invoice conversion requested.");
      setInvoicePendingConversion(null);
      setPurchaseOrderNumber("");
      setPurchaseOrderDate(new Date().toISOString().slice(0, 10));
      setLineItemSacs([]);
      setBulkSac("");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to convert proforma invoice.");
    },
  });

  const openConversionDialog = (invoice: Invoice) => {
    setInvoicePendingConversion(invoice);
    setPurchaseOrderNumber("");
    setPurchaseOrderDate(new Date().toISOString().slice(0, 10));
    setBulkSac("");
    setLineItemSacs((invoice.lineItems || []).map((li) => li.sac || ""));
  };

  const sortedInvoices = useMemo(() => {
    const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
    const dateValue = (value: string) => {
      const timestamp = new Date(value).getTime();
      return Number.isNaN(timestamp) ? 0 : timestamp;
    };

    return [...invoices].sort((left, right) => {
      switch (sortBy) {
        case "oldest":
          return dateValue(left.invoiceDate) - dateValue(right.invoiceDate);
        case "amount-high":
          return right.total - left.total;
        case "amount-low":
          return left.total - right.total;
        case "invoice-asc":
          return collator.compare(left.invoiceNo, right.invoiceNo);
        case "invoice-desc":
          return collator.compare(right.invoiceNo, left.invoiceNo);
        case "client-asc":
          return collator.compare(left.clientName, right.clientName);
        case "client-desc":
          return collator.compare(right.clientName, left.clientName);
        case "newest":
        default:
          return dateValue(right.invoiceDate) - dateValue(left.invoiceDate);
      }
    });
  }, [invoices, sortBy]);

  const loadInvoiceDetail = async (invoiceId: string, mode: "view" | "preview" | "reuse" = "view") => {
    try {
      const invoice = await fetchInvoiceDetail(invoiceId);
      if (mode === "view") {
        setSelectedInvoice(invoice);
      }
      if (mode === "preview") {
        setPdfPreviewInvoice(invoice);
      }
      if (mode === "reuse") {
        navigate("/invoices/new", { state: { templateInvoice: invoice } });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load invoice detail.");
    }
  };

  return (
    <div>
      <PageHeader
        kicker="History"
        title="Invoices"
        description="Track issued invoices, inspect generated details, and manage delivery status from one place."
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => downloadCsv(`invoices-${new Date().toISOString().slice(0,10)}.csv`, INVOICE_CSV_HEADERS, sortedInvoices.map(invoiceToRow))}>
              <Download size={13} /> Export CSV
            </Button>
            <Link to="/invoices/new">
              <Button className="gradient-warm text-primary-foreground border-0 shadow-soft hover:shadow-elevated hover:-translate-y-0.5 transition-all">New Invoice</Button>
            </Link>
          </div>
        }
      />

      <AlertDialog
        open={Boolean(invoicePendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setInvoicePendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice</AlertDialogTitle>
            <AlertDialogDescription>
              {invoicePendingDelete
                ? `Delete ${invoicePendingDelete.invoiceNo}? This will also remove all line items. Sequence numbers are not reused.`
                : "Delete this invoice?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending || !invoicePendingDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (invoicePendingDelete) {
                  deleteMutation.mutate(invoicePendingDelete);
                }
              }}
            >
              {deleteMutation.isPending ? (
                <>
                  <LoaderCircle size={16} className="animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 size={14} /> Delete Invoice
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={Boolean(invoicePendingConversion)}
        onOpenChange={(open) => {
          if (!open && !convertMutation.isPending) {
            setInvoicePendingConversion(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Convert to Tax Invoice</DialogTitle>
            <DialogDescription>
              {invoicePendingConversion
                ? `Converting ${invoicePendingConversion.invoiceNo} — review SAC codes and fill in PO details.`
                : "Create a tax invoice from this proforma invoice."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pr-1">
            {/* PO details row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Purchase Order No <span className="text-destructive">*</span></label>
                <Input
                  value={purchaseOrderNumber}
                  onChange={(event) => setPurchaseOrderNumber(event.target.value)}
                  placeholder="PO-7781"
                  disabled={convertMutation.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">PO Date <span className="text-destructive">*</span></label>
                <Popover open={poDateOpen} onOpenChange={setPoDateOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={convertMutation.isPending}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm flex items-center gap-2 text-left focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <CalendarIcon size={13} className="shrink-0 text-muted-foreground" />
                      {purchaseOrderDate ? format(new Date(purchaseOrderDate + "T00:00:00"), "dd MMM yyyy") : "Pick date"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={purchaseOrderDate ? new Date(purchaseOrderDate + "T00:00:00") : undefined}
                      onSelect={(date) => {
                        if (date) {
                          const y = date.getFullYear();
                          const m = String(date.getMonth() + 1).padStart(2, "0");
                          const d = String(date.getDate()).padStart(2, "0");
                          setPurchaseOrderDate(`${y}-${m}-${d}`);
                          setPoDateOpen(false);
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Line items with per-item SAC */}
            {(invoicePendingConversion?.lineItems || []).length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">SAC Codes per Line Item</label>
                  {/* Bulk fill helper */}
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={bulkSac}
                      onChange={(e) => setBulkSac(e.target.value)}
                      placeholder="e.g. 998314"
                      className="h-7 text-xs w-28 px-2"
                      disabled={convertMutation.isPending}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2"
                      disabled={!bulkSac.trim() || convertMutation.isPending}
                      onClick={() => setLineItemSacs((invoicePendingConversion?.lineItems || []).map(() => bulkSac.trim()))}
                    >
                      Fill all
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/60">
                  {(invoicePendingConversion?.lineItems || []).map((li, idx) => (
                    <div key={li.id ?? idx} className="flex items-center gap-3 px-3 py-2.5 bg-card">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{li.description}</p>
                        <p className="text-[10px] text-muted-foreground">{invoicePendingConversion?.showQuantity ? `Qty ${li.quantity ?? 1} × ` : ""}{(li.amount ?? 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}</p>
                      </div>
                      <Input
                        value={lineItemSacs[idx] ?? ""}
                        onChange={(e) => {
                          const next = [...lineItemSacs];
                          next[idx] = e.target.value;
                          setLineItemSacs(next);
                        }}
                        placeholder="SAC"
                        className="h-8 text-xs w-28 text-center font-mono"
                        disabled={convertMutation.isPending}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setInvoicePendingConversion(null)}
              disabled={convertMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="gradient-warm text-primary-foreground border-0"
              disabled={convertMutation.isPending || !invoicePendingConversion || !purchaseOrderNumber.trim() || !purchaseOrderDate}
              onClick={() => {
                if (!invoicePendingConversion) return;
                convertMutation.mutate({
                  invoiceId: invoicePendingConversion.id,
                  payload: { purchaseOrderNumber, purchaseOrderDate, lineItemSacs },
                });
              }}
            >
              {convertMutation.isPending ? (
                <>
                  <LoaderCircle size={16} className="animate-spin" />
                  Converting…
                </>
              ) : (
                "Create Tax Invoice"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col lg:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice number or client..." className="pl-10" />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as InvoiceSortOption)}>
          <SelectTrigger className="w-auto rounded-xl border border-border bg-card text-sm h-10 px-3 gap-2 shadow-none">
            <span className="flex items-center gap-2">
              <ArrowDownUp size={14} className="text-muted-foreground shrink-0" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="amount-high">Amount: high to low</SelectItem>
            <SelectItem value="amount-low">Amount: low to high</SelectItem>
            <SelectItem value="invoice-asc">Invoice no: A to Z</SelectItem>
            <SelectItem value="invoice-desc">Invoice no: Z to A</SelectItem>
            <SelectItem value="client-asc">Client: A to Z</SelectItem>
            <SelectItem value="client-desc">Client: Z to A</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1.5 bg-muted rounded-xl p-1 overflow-x-auto">
          {(["all", "generated", "pending", "sent", "partially_paid", "paid", "cancelled", "converted"] as const).map((option) => (
            <button key={option} onClick={() => setFilter(option)} className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${filter === option ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {STATUS_LABELS[option] ?? option}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectedInvoice && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm px-4 py-8 overflow-y-auto" onClick={() => setSelectedInvoice(null)}>
            <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.2 }} className="max-w-3xl mx-auto bg-card rounded-3xl border border-border shadow-elevated p-6 md:p-7" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-primary font-semibold mb-2">Invoice Detail</p>
                  <h3 className="text-2xl font-black tracking-tight">{selectedInvoice.invoiceNo}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{selectedInvoice.clientName} · {selectedInvoice.invoiceType === "proforma" ? "Proforma Invoice" : "Tax Invoice"}</p>
                </div>
                <button onClick={() => setSelectedInvoice(null)} className="p-2 rounded-xl hover:bg-muted transition-colors"><X size={18} /></button>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground mb-1">{selectedInvoice.invoiceType === "proforma" ? "Issue Date" : "Invoice Date"}</p><p className="font-semibold">{formatDate(selectedInvoice.invoiceDate)}</p></div>
                <div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground mb-1">Due</p><p className="font-semibold">{selectedInvoice.includeDueDate === false ? "Hidden" : formatDate(selectedInvoice.dueDate)}</p></div>
                <div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground mb-1">Type</p><p className="font-semibold">{selectedInvoice.invoiceType === "proforma" ? "Proforma Invoice" : selectedInvoice.gstType}</p></div>
                <div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground mb-1">Status</p><div className="mt-1"><StatusBadge status={selectedInvoice.status} /></div></div>
              </div>

              <div className="rounded-2xl border border-border overflow-hidden">
                <div className={`grid ${selectedInvoice.showQuantity ? "grid-cols-[1fr,100px,100px,120px,120px]" : "grid-cols-[1fr,120px,120px]"} px-5 py-3 bg-muted/50 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground`}>
                  <div>Description</div>
                  <div>SAC</div>
                  {selectedInvoice.showQuantity && <div className="text-right">Qty</div>}
                  {selectedInvoice.showQuantity && <div className="text-right">Unit Price</div>}
                  <div className="text-right">{selectedInvoice.invoiceType === "proforma" ? "Amount" : selectedInvoice.showQuantity ? "Taxable Value" : "Price"}</div>
                </div>
                {(selectedInvoice.lineItems || []).map((item) => (
                  <div key={item.id} className={`grid ${selectedInvoice.showQuantity ? "grid-cols-[1fr,100px,100px,120px,120px]" : "grid-cols-[1fr,120px,120px]"} px-5 py-4 border-t border-border text-sm`}>
                    <div>{item.description}</div>
                    <div>{item.sac}</div>
                    {selectedInvoice.showQuantity && <div className="text-right font-semibold">{item.quantity ?? "-"}</div>}
                    {selectedInvoice.showQuantity && <div className="text-right font-semibold">{formatCurrency(item.unitPrice ?? item.amount)}</div>}
                    <div className="text-right font-semibold">{formatCurrency(item.amount)}</div>
                  </div>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 gap-6 mt-6">
                <div className="rounded-2xl border border-border p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">{selectedInvoice.invoiceType === "proforma" ? "Amount Summary" : "Tax Breakdown"}</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>{selectedInvoice.invoiceType === "proforma" ? "Amount" : "Taxable"}</span><span className="font-semibold">{formatCurrency(selectedInvoice.amount)}</span></div>
                    {selectedInvoice.invoiceType !== "proforma" && <div className="flex justify-between"><span>CGST</span><span className="font-semibold">{formatCurrency(selectedInvoice.cgst)}</span></div>}
                    {selectedInvoice.invoiceType !== "proforma" && <div className="flex justify-between"><span>SGST</span><span className="font-semibold">{formatCurrency(selectedInvoice.sgst)}</span></div>}
                    {selectedInvoice.invoiceType !== "proforma" && <div className="flex justify-between"><span>IGST</span><span className="font-semibold">{formatCurrency(selectedInvoice.igst)}</span></div>}
                    <div className="h-px bg-border my-2" />
                    <div className="flex justify-between text-base"><span className="font-semibold">Total</span><span className="font-black text-primary">{formatCurrency(selectedInvoice.total)}</span></div>
                  </div>
                </div>
                <div className="rounded-2xl border border-border p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">Client</p>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-muted-foreground">GSTIN:</span> {selectedInvoice.gstin}</p>
                    <p><span className="text-muted-foreground">Place of Supply:</span> {selectedInvoice.placeOfSupply}</p>
                    {selectedInvoice.invoiceType === "proforma" && <p><span className="text-muted-foreground">Due Date:</span> {selectedInvoice.includeDueDate === false ? "Hidden" : formatDate(selectedInvoice.dueDate)}</p>}
                    {selectedInvoice.invoiceType !== "proforma" && <p><span className="text-muted-foreground">Reverse Charge:</span> {selectedInvoice.reverseCharge}</p>}
                    {selectedInvoice.sourceProforma && (
                      <p>
                        <span className="text-muted-foreground">Proforma:</span> {selectedInvoice.sourceProforma.invoiceNo}
                        {selectedInvoice.sourceProforma.invoiceDate ? ` · ${formatDate(selectedInvoice.sourceProforma.invoiceDate)}` : ""}
                      </p>
                    )}
                    {selectedInvoice.purchaseOrder && (
                      <p>
                        <span className="text-muted-foreground">Purchase Order:</span> {selectedInvoice.purchaseOrder.number}
                        {selectedInvoice.purchaseOrder.date ? ` · ${formatDate(selectedInvoice.purchaseOrder.date)}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {selectedInvoice.totalInWords && <p className="text-xs text-muted-foreground mt-4 italic">{selectedInvoice.totalInWords}</p>}

              <div className="flex flex-wrap gap-2 mt-4">
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => loadInvoiceDetail(selectedInvoice.id, "reuse")}>Reuse Items</Button>
                {selectedInvoice.invoiceType === "proforma" && selectedInvoice.status !== "converted" && (
                  <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => openConversionDialog(selectedInvoice)}>
                    Convert to Tax Invoice
                  </Button>
                )}
                {selectedInvoice.status === "converted" ? (
                  <StatusBadge status="converted" />
                ) : (
                  <Select
                    value={selectedInvoice.status}
                    onValueChange={(value) => statusMutation.mutate({ invoiceId: selectedInvoice.id, status: value })}
                    disabled={statusMutation.isPending}
                  >
                    <SelectTrigger className={`h-8 w-36 text-xs font-semibold ${STATUS_TRIGGER_CLASSES[selectedInvoice.status] ?? ""}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedInvoice.invoiceType === "proforma" ? (
                        <>
                          <SelectItem value="generated">Generated</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="generated">Generated</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="partially_paid">Partially Paid</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="outline" size="sm" className="text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive" onClick={() => setInvoicePendingDelete(selectedInvoice)}>
                  <Trash2 size={12} /> Delete
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <InvoicePdfPreview invoice={pdfPreviewInvoice} onClose={() => setPdfPreviewInvoice(null)} />

      <div className="grid gap-3">
        {isLoading && <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">Loading invoices…</div>}
        {!isLoading && sortedInvoices.length === 0 && <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">No invoices found.</div>}
        {sortedInvoices.map((invoice, index) => (
          <motion.div key={invoice.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="bg-card rounded-2xl border border-border p-5 shadow-soft hover:shadow-elevated transition-all duration-200">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-1.5">
                  <h4 className="text-sm font-bold tracking-tight">{invoice.invoiceNo}</h4>
                  <StatusBadge status={invoice.status} />
                </div>
                <p className="text-sm text-muted-foreground">{invoice.clientName} · {invoice.invoiceType === "proforma" ? "Proforma Invoice" : invoice.gstType}</p>
                <p className="text-xs text-muted-foreground mt-1">{invoice.invoiceType === "proforma" ? `Issue Date ${formatDate(invoice.invoiceDate)}` : `Invoice Date ${formatDate(invoice.invoiceDate)}`}{invoice.includeDueDate === false ? "" : ` · Due ${formatDate(invoice.dueDate)}`}</p>
              </div>

              <div className="flex items-center gap-3 flex-wrap lg:flex-nowrap">
                <div className="text-right min-w-[128px]">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Total</p>
                  <p className="text-lg font-black tracking-tight">{formatCurrency(invoice.total)}</p>
                </div>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => loadInvoiceDetail(invoice.id, "view")}>View</Button>
                <Button variant="outline" size="sm" className="text-xs h-8 gap-1" onClick={() => loadInvoiceDetail(invoice.id, "preview")}>
                  <Eye size={12} /> Preview
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-8 gap-1" onClick={() => void downloadInvoicePdf(invoice)}>
                  <FileDown size={12} /> PDF
                </Button>
                {invoice.invoiceType === "proforma" && invoice.status !== "converted" && (
                  <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => openConversionDialog(invoice)}>
                    Convert to Tax Invoice
                  </Button>
                )}
                {invoice.status === "converted" ? (
                  <StatusBadge status="converted" />
                ) : (
                  <Select
                    value={invoice.status}
                    onValueChange={(value) => statusMutation.mutate({ invoiceId: invoice.id, status: value })}
                    disabled={statusMutation.isPending}
                  >
                    <SelectTrigger className={`h-8 w-36 text-xs font-semibold ${STATUS_TRIGGER_CLASSES[invoice.status] ?? ""}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {invoice.invoiceType === "proforma" ? (
                        <>
                          <SelectItem value="generated">Generated</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="generated">Generated</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="partially_paid">Partially Paid</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="outline" size="sm" className="text-xs h-8 gap-1 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive" onClick={() => setInvoicePendingDelete(invoice)}>
                  <Trash2 size={12} /> Delete
                </Button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}