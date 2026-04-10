import { type FormEvent, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, FileDown, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { createInvoice, type CreateInvoiceResult, fetchClients, formatCurrency } from "@/services/api";
import type { Invoice, LineItem } from "@/types/invoice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getActualInvoicePdfDownloadUrl } from "@/services/invoicePdf";

const COMPANY_STATE_CODE = 24;

interface TemplateLocationState {
  templateInvoice?: Invoice;
}

function getLineItemAmount(item: LineItem, showQuantity: boolean) {
  if (!showQuantity) {
    return Number(item.amount || 0);
  }

  return Number(item.quantity || 0) * Number(item.unitPrice || 0);
}

export default function CreateInvoicePage() {
  const location = useLocation();
  const templateInvoice = (location.state as TemplateLocationState | null)?.templateInvoice;
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients", "active"],
    queryFn: () => fetchClients({ active: "active" }),
  });
  const [selectedClientId, setSelectedClientId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceType, setInvoiceType] = useState<"tax" | "proforma">("tax");
  const [showQuantity, setShowQuantity] = useState(false);
  const [includeDueDate, setIncludeDueDate] = useState(true);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "AI-based Marketing Image Generation Services", sac: "998314", amount: 300000, quantity: 1, unitPrice: 300000 },
  ]);
  const [submittedInvoice, setSubmittedInvoice] = useState<CreateInvoiceResult | null>(null);

  useEffect(() => {
    if (!clients.length) {
      return;
    }

    if (templateInvoice) {
      const matchedClient = clients.find((client) => client.name === templateInvoice.clientName && client.active);
      if (matchedClient) {
        setSelectedClientId(matchedClient.id);
      }

      setInvoiceType(templateInvoice.invoiceType === "proforma" ? "proforma" : "tax");
      setShowQuantity(Boolean(templateInvoice.showQuantity));
      setIncludeDueDate(templateInvoice.includeDueDate !== false);

      if (templateInvoice.lineItems?.length) {
        setLineItems(
          templateInvoice.lineItems.map((lineItem) => ({
            description: lineItem.description,
            sac: lineItem.sac,
            amount: lineItem.amount,
            quantity: lineItem.quantity ?? 1,
            unitPrice: lineItem.unitPrice ?? lineItem.amount,
          }))
        );
      }
      return;
    }

    setSelectedClientId((current) => current || clients[0]?.id || "");
  }, [clients, templateInvoice]);

  useEffect(() => {
    if (invoiceType === "tax") {
      setIncludeDueDate(true);
    }
  }, [invoiceType]);

  useEffect(() => {
    if (!showQuantity) {
      return;
    }

    setLineItems((current) =>
      current.map((item) => ({
        ...item,
        quantity: item.quantity ?? 1,
        unitPrice: item.unitPrice ?? item.amount,
      }))
    );
  }, [showQuantity]);

  const createInvoiceMutation = useMutation({
    mutationFn: createInvoice,
    onSuccess: (invoice) => {
      setSubmittedInvoice(invoice);
      toast.success(invoice.invoiceNo ? `Created ${invoice.invoiceNo}` : "Invoice request accepted.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to create invoice.");
    },
  });

  const selectedClient = clients.find((client) => client.id === selectedClientId);
  const isIntraState = selectedClient?.stateCode === COMPANY_STATE_CODE;

  const totals = useMemo(() => {
    const amount = lineItems.reduce((sum, item) => sum + getLineItemAmount(item, showQuantity), 0);
    if (invoiceType === "proforma") {
      return { amount, cgst: 0, sgst: 0, igst: 0, total: amount };
    }

    const cgst = isIntraState ? amount * 0.09 : 0;
    const sgst = isIntraState ? amount * 0.09 : 0;
    const igst = !isIntraState ? amount * 0.18 : 0;
    const total = amount + cgst + sgst + igst;

    return { amount, cgst, sgst, igst, total };
  }, [invoiceType, isIntraState, lineItems, showQuantity]);

  const createdInvoiceDownloadUrl = submittedInvoice?.invoiceNo
    ? getActualInvoicePdfDownloadUrl({
        id: submittedInvoice.invoiceRecordId ? String(submittedInvoice.invoiceRecordId) : "",
        invoiceNo: submittedInvoice.invoiceNo,
        idempotencyKey: "",
        invoiceDate,
        dueDate: "",
        clientName: selectedClient?.name || "",
        gstin: selectedClient?.gstin || "",
        state: selectedClient?.state || "",
        stateCode: selectedClient?.stateCode || 0,
        placeOfSupply: "",
        gstType: invoiceType === "proforma" ? "NONE" : isIntraState ? "CGST/SGST" : "IGST",
        amount: totals.amount,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        total: typeof submittedInvoice.total === "number" ? submittedInvoice.total : totals.total,
        sac: lineItems[0]?.sac || "",
        reverseCharge: "No",
        status: "generated",
        totalInWords: "",
        googleDriveUrl: submittedInvoice.googleDriveUrl ? String(submittedInvoice.googleDriveUrl) : "",
        googleDriveFileId: submittedInvoice.googleDriveFileId ? String(submittedInvoice.googleDriveFileId) : "",
        invoiceType,
      })
    : null;

  const handleDownloadCreatedInvoice = () => {
    if (!createdInvoiceDownloadUrl || !submittedInvoice?.invoiceNo) {
      toast.error("PDF is not available for download yet.");
      return;
    }

    const link = document.createElement("a");
    link.href = createdInvoiceDownloadUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.download = `${submittedInvoice.invoiceNo.replace(/\//g, "-")}.pdf`;
    link.click();
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        return {
          ...item,
          [field]: field === "amount" || field === "quantity" || field === "unitPrice" ? Number(value) : value,
        };
      })
    );
  };

  const addLineItem = () => {
    setLineItems((current) => [
      ...current,
      {
        description: "",
        sac: invoiceType === "tax" ? selectedClient?.defaultSac || "998314" : "",
        amount: 0,
        quantity: 1,
        unitPrice: null,
      },
    ]);
  };

  const removeLineItem = (index: number) => {
    setLineItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedInvoice(null);
    createInvoiceMutation.mutate({
      clientId: selectedClientId,
      invoiceDate,
      invoiceType,
      showQuantity,
      includeDueDate,
      lineItems: lineItems.map((item) => ({
        ...item,
        amount: getLineItemAmount(item, showQuantity),
        sac: invoiceType === "proforma" ? item.sac || "" : item.sac,
      })),
    });
  };

  return (
    <div>
      <PageHeader
        kicker="Issue"
        title="Create Invoice"
        description="Create either a GST tax invoice or a proforma invoice, with optional quantity-based line items and proforma due-date control."
      />

      <form onSubmit={handleSubmit} className="grid xl:grid-cols-[1.2fr,0.8fr] gap-6 items-start">
        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-3xl border border-border shadow-soft p-6 md:p-7">
            <h3 className="text-lg font-bold mb-5">Invoice Setup</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Client</label>
                <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" required>
                  {!clients.length && <option value="">No active clients available</option>}
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name} · {client.state} ({client.stateCode})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Invoice Date</label>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Invoice Type</label>
                <select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as "tax" | "proforma")} className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="tax">Tax Invoice</option>
                  <option value="proforma">Proforma Invoice</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-3 text-sm rounded-xl border border-border px-4 py-3 w-full bg-background">
                  <input type="checkbox" checked={showQuantity} onChange={(e) => setShowQuantity(e.target.checked)} className="w-4 h-4 rounded accent-primary" />
                  <span>Show Qty column</span>
                </label>
              </div>
            </div>

            {invoiceType === "proforma" && (
              <div className="mt-4 rounded-2xl border border-border bg-background p-4">
                <label className="flex items-center gap-3 text-sm">
                  <input type="checkbox" checked={includeDueDate} onChange={(e) => setIncludeDueDate(e.target.checked)} className="w-4 h-4 rounded accent-primary" />
                  <span>Include Due Date on proforma invoice</span>
                </label>
              </div>
            )}

            {selectedClient && (
              <div className="mt-5 rounded-2xl bg-muted/50 border border-border p-4 grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">Client GST</p>
                  <p className="font-semibold">{selectedClient.gstin}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">Mode</p>
                  <p className="font-semibold">{invoiceType === "proforma" ? "Proforma Invoice" : isIntraState ? "CGST + SGST" : "IGST"}</p>
                </div>
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-3xl border border-border shadow-soft p-6 md:p-7">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">Line Items</h3>
              <Button type="button" onClick={addLineItem} variant="outline" className="rounded-xl">
                <Plus size={14} className="mr-2" /> Add Item
              </Button>
            </div>
            <div className="space-y-4">
              {lineItems.map((item, index) => (
                <div key={index} className={`grid ${showQuantity ? "md:grid-cols-[1fr,120px,120px,160px,120px,44px]" : "md:grid-cols-[1fr,160px,180px,44px]"} gap-3 items-end rounded-2xl border border-border p-4`}>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Description</label>
                    <Input value={item.description} onChange={(e) => updateLineItem(index, "description", e.target.value)} placeholder="Service description" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">SAC</label>
                    <Input value={item.sac} onChange={(e) => updateLineItem(index, "sac", e.target.value)} placeholder={invoiceType === "proforma" ? "Optional" : "998314"} required={invoiceType === "tax"} />
                  </div>
                  {showQuantity && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Qty</label>
                      <Input type="number" min={0} step="any" value={item.quantity ?? 1} onChange={(e) => updateLineItem(index, "quantity", e.target.value)} placeholder="1" required />
                    </div>
                  )}
                  {showQuantity && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Unit Price</label>
                      <Input type="number" min={0} step="any" value={item.unitPrice ?? item.amount} onChange={(e) => updateLineItem(index, "unitPrice", e.target.value)} placeholder="0" required />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">{showQuantity ? "Amount" : "Price"}</label>
                    {showQuantity ? (
                      <div className="h-11 px-4 rounded-xl border border-input bg-muted/40 text-sm flex items-center font-semibold">
                        {formatCurrency(getLineItemAmount(item, showQuantity))}
                      </div>
                    ) : (
                      <Input type="number" min={0} step="any" value={item.amount} onChange={(e) => updateLineItem(index, "amount", e.target.value)} placeholder="0" required />
                    )}
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeLineItem(index)} disabled={lineItems.length === 1} className="rounded-xl text-muted-foreground hover:text-destructive">
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="bg-card rounded-3xl border border-border shadow-soft p-6 md:p-7 sticky top-24">
          <h3 className="text-lg font-bold mb-5">Summary</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">{invoiceType === "proforma" ? "Amount" : "Taxable Value"}</span><span className="font-semibold">{formatCurrency(totals.amount)}</span></div>
            {invoiceType === "tax" && (
              <>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">CGST</span><span className="font-semibold">{formatCurrency(totals.cgst)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">SGST</span><span className="font-semibold">{formatCurrency(totals.sgst)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">IGST</span><span className="font-semibold">{formatCurrency(totals.igst)}</span></div>
              </>
            )}
            <div className="h-px bg-border my-3" />
            <div className="flex items-center justify-between text-base"><span className="font-semibold">Grand Total</span><span className="font-black text-primary">{formatCurrency(totals.total)}</span></div>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-muted/50 p-4 text-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">System Notes</p>
            <p className="text-muted-foreground leading-relaxed">Tax invoices keep GST split logic. Proforma invoices remove tax columns. When Qty is enabled, the invoice shows Qty and Unit Price, and the amount is calculated automatically.</p>
          </div>

          <div className="flex items-center gap-4 mt-6">
            <Button type="submit" disabled={createInvoiceMutation.isPending || !selectedClientId || isLoading} className="gradient-warm text-primary-foreground border-0 shadow-soft hover:shadow-elevated hover:-translate-y-0.5 transition-all px-8">
              {createInvoiceMutation.isPending ? (
                <>
                  <LoaderCircle size={16} className="animate-spin" />
                  Generating {invoiceType === "proforma" ? "Proforma" : "Invoice"}...
                </>
              ) : (
                <>Generate {invoiceType === "proforma" ? "Proforma" : "Invoice"}</>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!createdInvoiceDownloadUrl || createInvoiceMutation.isPending}
              className="text-xs h-11 gap-2"
              onClick={handleDownloadCreatedInvoice}
            >
              <FileDown size={14} /> Download PDF
            </Button>
          </div>

          {submittedInvoice?.invoiceNo && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-2xl border border-success/20 bg-success/5 px-4 py-4"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-success">
                  <CheckCircle2 size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-success font-semibold mb-1">Generated</p>
                  <p className="text-base font-bold text-foreground">{submittedInvoice.invoiceNo}</p>
                  <p className="text-sm text-muted-foreground mt-1">The invoice was created successfully. You can download the generated PDF immediately.</p>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </form>
    </div>
  );
}