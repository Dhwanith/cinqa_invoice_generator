import { type FormEvent, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarIcon, Check, CheckCircle2, ChevronsUpDown, FileDown, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import PageHeader from "@/components/PageHeader";
import { createInvoice, fetchInvoiceDetail, updateInvoice, type CreateInvoiceResult, fetchClients, formatCurrency } from "@/services/api";
import { downloadInvoicePdf } from "@/services/invoicePdf";
import type { Invoice, LineItem } from "@/types/invoice";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

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
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const location = useLocation();
  const templateInvoice = (location.state as TemplateLocationState | null)?.templateInvoice;

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients", "active"],
    queryFn: () => fetchClients({ active: "active" }),
  });

  const { data: existingInvoice, isLoading: isInvoiceLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => fetchInvoiceDetail(id!),
    enabled: Boolean(id),
  });

  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientOpen, setClientOpen] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dateOpen, setDateOpen] = useState(false);
  const [invoiceType, setInvoiceType] = useState<"tax" | "proforma">("tax");
  const [showQuantity, setShowQuantity] = useState(false);
  const [includeDueDate, setIncludeDueDate] = useState(true);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", sac: "", amount: 0, quantity: null, unitPrice: null },
  ]);
  const [submittedInvoice, setSubmittedInvoice] = useState<CreateInvoiceResult | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Pre-fill fields when editing an existing invoice
  useEffect(() => {
    if (!isEdit || !existingInvoice) return;

    if (existingInvoice.clientRecordId) {
      setSelectedClientId(existingInvoice.clientRecordId);
    } else if (clients.length) {
      const matched = clients.find((c) => c.name === existingInvoice.clientName);
      if (matched) setSelectedClientId(matched.id);
    }

    if (existingInvoice.invoiceDate) setInvoiceDate(existingInvoice.invoiceDate);
    setInvoiceType(existingInvoice.invoiceType === "proforma" ? "proforma" : "tax");
    setShowQuantity(Boolean(existingInvoice.showQuantity));
    setIncludeDueDate(existingInvoice.includeDueDate !== false);

    if (existingInvoice.lineItems?.length) {
      setLineItems(
        existingInvoice.lineItems.map((li) => ({
          description: li.description,
          sac: li.sac || "",
          amount: li.amount,
          quantity: li.quantity ?? (existingInvoice.showQuantity ? 1 : null),
          unitPrice: li.unitPrice ?? (existingInvoice.showQuantity ? li.amount : null),
        }))
      );
    }
  }, [isEdit, existingInvoice, clients]);

  // Pre-fill fields when creating from template
  useEffect(() => {
    if (isEdit || !clients.length) return;

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
  }, [clients, templateInvoice, isEdit]);

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
        quantity: item.quantity ?? null,
        unitPrice: item.unitPrice ?? null,
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

  const updateInvoiceMutation = useMutation({
    mutationFn: (payload: { clientId: string; invoiceDate: string; invoiceType?: "tax" | "proforma"; showQuantity?: boolean; includeDueDate?: boolean; lineItems: LineItem[] }) =>
      updateInvoice(id!, payload),
    onSuccess: (invoice) => {
      setSubmittedInvoice(invoice);
      toast.success(invoice.invoiceNo ? `Updated ${invoice.invoiceNo}` : "Invoice updated successfully.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update invoice.");
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

  const canDownloadPdf = Boolean(submittedInvoice?.invoiceRecordId || (isEdit && id));

  const handleDownloadCreatedInvoice = async () => {
    const targetId = submittedInvoice?.invoiceRecordId || (isEdit ? id : null);
    if (!targetId) {
      toast.error("PDF is not available for download yet.");
      return;
    }
    setDownloadingPdf(true);
    try {
      await downloadInvoicePdf({
        id: targetId,
        clientName: selectedClient?.name || existingInvoice?.clientName || "",
        invoiceNo: submittedInvoice?.invoiceNo || existingInvoice?.invoiceNo || "Invoice",
      });
    } catch (err) {
      toast.error("Failed to download PDF.");
    } finally {
      setDownloadingPdf(false);
    }
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
      { description: "", sac: "", amount: 0, quantity: null, unitPrice: null },
    ]);
  };

  const removeLineItem = (index: number) => {
    setLineItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const isPending = createInvoiceMutation.isPending || updateInvoiceMutation.isPending;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedInvoice(null);
    const payload = {
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
    };

    if (isEdit && id) {
      updateInvoiceMutation.mutate(payload);
    } else {
      createInvoiceMutation.mutate(payload);
    }
  };

  return (
    <div>
      <PageHeader
        kicker={isEdit ? "Manage" : "Issue"}
        title={isEdit ? `Edit ${existingInvoice?.invoiceNo || "Invoice"}` : "Create Invoice"}
        description={isEdit ? "Update client details, line items, or billing preferences for this invoice while maintaining its sequence number." : "Create either a GST tax invoice or a proforma invoice, with optional quantity-based line items and proforma due-date control."}
      />

      <form onSubmit={handleSubmit} className="grid xl:grid-cols-[1.2fr,0.8fr] gap-6 items-start">
        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-3xl border border-border shadow-soft p-6 md:p-7">
            <h3 className="text-lg font-bold mb-5">Invoice Setup</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Client</label>
                <Popover open={clientOpen} onOpenChange={setClientOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      role="combobox"
                      aria-expanded={clientOpen}
                      className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring flex items-center justify-between text-left"
                    >
                      <span className={cn("truncate", !selectedClient && "text-muted-foreground")}>
                        {selectedClient ? selectedClient.name : isLoading ? "Loading…" : "Select client…"}
                      </span>
                      <ChevronsUpDown size={14} className="ml-2 shrink-0 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                    <Command>
                      <CommandInput placeholder="Search clients…" />
                      <CommandList>
                        <CommandEmpty>No clients found.</CommandEmpty>
                        <CommandGroup>
                          {clients.map((client) => (
                            <CommandItem
                              key={client.id}
                              value={client.name}
                              onSelect={() => { setSelectedClientId(client.id); setClientOpen(false); }}
                            >
                              <Check size={13} className={cn("mr-2 shrink-0", selectedClientId === client.id ? "opacity-100" : "opacity-0")} />
                              <span className="flex-1">{client.name}</span>
                              <span className="ml-3 text-xs text-muted-foreground">{client.state} ({client.stateCode})</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Invoice Date</label>
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring flex items-center gap-2 text-left"
                    >
                      <CalendarIcon size={14} className="shrink-0 text-muted-foreground" />
                      {invoiceDate ? format(new Date(invoiceDate + "T00:00:00"), "dd MMM yyyy") : "Pick a date"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={invoiceDate ? new Date(invoiceDate + "T00:00:00") : undefined}
                      onSelect={(date) => {
                        if (date) {
                          const y = date.getFullYear();
                          const m = String(date.getMonth() + 1).padStart(2, "0");
                          const d = String(date.getDate()).padStart(2, "0");
                          setInvoiceDate(`${y}-${m}-${d}`);
                          setDateOpen(false);
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Invoice Type</label>
                <Select value={invoiceType} onValueChange={(v) => setInvoiceType(v as "tax" | "proforma")}>
                  <SelectTrigger className="w-full rounded-xl h-[46px] px-4 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tax">Tax Invoice</SelectItem>
                    <SelectItem value="proforma">Proforma Invoice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-3 text-sm rounded-xl border border-border px-4 py-3 w-full bg-background cursor-pointer">
                  <Checkbox checked={showQuantity} onCheckedChange={(checked) => setShowQuantity(Boolean(checked))} />
                  <span>Show Qty column</span>
                </label>
              </div>
            </div>

            {invoiceType === "proforma" && (
              <div className="mt-4 rounded-2xl border border-border bg-background p-4">
                <label className="flex items-center gap-3 text-sm cursor-pointer">
                  <Checkbox checked={includeDueDate} onCheckedChange={(checked) => setIncludeDueDate(Boolean(checked))} />
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
                <div key={index} className="rounded-2xl border border-border p-4 space-y-3">
                  {/* Row 1: Description */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Description</label>
                    <Textarea
                      ref={(el) => {
                        if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
                      }}
                      value={item.description}
                      onChange={(e) => {
                        updateLineItem(index, "description", e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      placeholder="Service description"
                      required
                      rows={1}
                      className="min-h-[44px] resize-none overflow-hidden py-2.5 leading-snug"
                    />
                  </div>

                  {/* Row 2: SAC, numeric fields, delete */}
                  <div className={`grid gap-3 items-end ${showQuantity ? "sm:grid-cols-[130px,90px,1fr,130px,44px]" : "sm:grid-cols-[130px,1fr,44px]"}`}>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">SAC</label>
                      <Input value={item.sac} onChange={(e) => updateLineItem(index, "sac", e.target.value)} placeholder={invoiceType === "proforma" ? "Optional" : "998314"} required={invoiceType === "tax"} />
                    </div>
                    {showQuantity && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Qty</label>
                        <Input type="number" min={0} step="any" value={item.quantity ?? ""} onChange={(e) => updateLineItem(index, "quantity", e.target.value)} placeholder="e.g. 2" required />
                      </div>
                    )}
                    {showQuantity && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Unit Price</label>
                        <Input type="number" min={0} step="any" value={item.unitPrice ?? ""} onChange={(e) => updateLineItem(index, "unitPrice", e.target.value)} placeholder="e.g. 5000" required />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">{showQuantity ? "Amount" : "Price"}</label>
                      {showQuantity ? (
                        <div className="h-11 px-4 rounded-xl border border-input bg-muted/40 text-sm flex items-center font-semibold">
                          {formatCurrency(getLineItemAmount(item, showQuantity))}
                        </div>
                      ) : (
                        <Input type="number" min={0} step="any" value={item.amount || ""} onChange={(e) => updateLineItem(index, "amount", e.target.value)} placeholder="e.g. 100000" required />
                      )}
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeLineItem(index)} disabled={lineItems.length === 1} className="rounded-xl text-muted-foreground hover:text-destructive mt-[22px]">
                      <Trash2 size={16} />
                    </Button>
                  </div>
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
            <Button type="submit" disabled={isPending || !selectedClientId || isLoading || (isEdit && isInvoiceLoading)} className="gradient-warm text-primary-foreground border-0 shadow-soft hover:shadow-elevated hover:-translate-y-0.5 transition-all px-8">
              {isPending ? (
                <>
                  <LoaderCircle size={16} className="animate-spin" />
                  {isEdit ? "Updating Invoice..." : `Generating ${invoiceType === "proforma" ? "Proforma" : "Invoice"}...`}
                </>
              ) : (
                <>{isEdit ? "Save Changes" : `Generate ${invoiceType === "proforma" ? "Proforma" : "Invoice"}`}</>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canDownloadPdf || isPending || downloadingPdf}
              className="text-xs h-11 gap-2"
              onClick={handleDownloadCreatedInvoice}
            >
              {downloadingPdf ? <LoaderCircle size={14} className="animate-spin" /> : <FileDown size={14} />} Download PDF
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
                  <p className="text-xs uppercase tracking-[0.18em] text-success font-semibold mb-1">{isEdit ? "Updated" : "Generated"}</p>
                  <p className="text-base font-bold text-foreground">{submittedInvoice.invoiceNo}</p>
                  <p className="text-sm text-muted-foreground mt-1">The invoice was {isEdit ? "updated" : "created"} successfully. You can download the generated PDF immediately.</p>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </form>
    </div>
  );
}