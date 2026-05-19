import { type FormEvent, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Building2, Plus, Search, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createVendor, fetchVendors, updateVendor } from "@/services/purchases-api";
import type { CreateVendorPayload, Vendor, VendorCategory } from "@/types/purchase";
import { VENDOR_CATEGORY_LABELS } from "@/types/purchase";

const COMPANY_STATE_CODE = 24;

const defaultForm: CreateVendorPayload = {
  name: "", gstin: "", state: "", stateCode: 0,
  addressLine1: "", addressLine2: "", addressLine3: "",
  category: "other", defaultPaymentTermsDays: 30,
  email: "", phone: "", active: true, notes: "",
};

export default function VendorsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState<CreateVendorPayload>(defaultForm);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendors", search, filter],
    queryFn: () => fetchVendors({ search, active: filter }),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: CreateVendorPayload) =>
      editingVendor ? updateVendor(editingVendor.id, payload) : createVendor(payload),
    onSuccess: (vendor) => {
      toast.success(editingVendor ? `Updated ${vendor.name}` : `Added ${vendor.name}`);
      qc.invalidateQueries({ queryKey: ["vendors"] });
      handleCancel();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Unable to save vendor."),
  });

  const upd = <K extends keyof CreateVendorPayload>(k: K, v: CreateVendorPayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleEdit = (v: Vendor) => {
    setEditingVendor(v);
    setForm({
      name: v.name, gstin: v.gstin, state: v.state, stateCode: v.stateCode,
      addressLine1: v.addressLines[0] || "", addressLine2: v.addressLines[1] || "",
      addressLine3: v.addressLines[2] || "",
      category: v.category, defaultPaymentTermsDays: v.defaultPaymentTermsDays,
      email: v.email, phone: v.phone, active: v.active, notes: v.notes,
    });
    setShowForm(true);
  };

  const handleCancel = () => { setEditingVendor(null); setForm(defaultForm); setShowForm(false); };

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); saveMutation.mutate(form); };

  // GSTIN auto-fills state code if it matches known pattern
  const handleGstinChange = (value: string) => {
    const upper = value.toUpperCase();
    upd("gstin", upper);
    if (upper.length >= 2) {
      const code = parseInt(upper.slice(0, 2), 10);
      if (!isNaN(code) && code > 0) upd("stateCode", code);
    }
  };

  const gstTypeSuffix = useMemo(() => {
    if (!form.stateCode) return null;
    return form.stateCode === COMPANY_STATE_CODE ? "CGST + SGST (Same State)" : "IGST (Inter-State)";
  }, [form.stateCode]);

  return (
    <div>
      <PageHeader
        kicker="Purchases"
        title="Vendors"
        description="Manage your vendor master. Vendors are the bill-from parties for your purchases."
        action={
          <Button onClick={() => { if (showForm) handleCancel(); else { setEditingVendor(null); setForm(defaultForm); setShowForm(true); } }}
            className="gradient-warm text-primary-foreground border-0 shadow-soft hover:shadow-elevated hover:-translate-y-0.5 transition-all">
            <Plus size={16} className="mr-2" /> Add Vendor
          </Button>
        }
      />

      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mb-8">
          <div className="bg-card rounded-2xl border border-border shadow-soft p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-primary" />
                <h3 className="text-lg font-bold">{editingVendor ? `Edit ${editingVendor.name}` : "Add New Vendor"}</h3>
              </div>
              <button type="button" onClick={handleCancel} className="p-2 rounded-xl hover:bg-muted transition-colors">
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="grid gap-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">Vendor / Company Name</label>
                  <Input value={form.name} onChange={(e) => upd("name", e.target.value)} placeholder="e.g. Amazon Web Services India" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">GSTIN <span className="text-muted-foreground/60">(optional)</span></label>
                  <Input value={form.gstin} onChange={(e) => handleGstinChange(e.target.value)} placeholder="15-character GSTIN" maxLength={15} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Category</label>
                  <Select value={form.category} onValueChange={(v) => upd("category", v as VendorCategory)}>
                    <SelectTrigger className="rounded-xl h-[46px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(VENDOR_CATEGORY_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">State</label>
                  <Input value={form.state} onChange={(e) => upd("state", e.target.value)} placeholder="e.g. Maharashtra" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    State Code
                    {gstTypeSuffix && <span className="ml-2 text-[10px] text-primary font-normal">→ {gstTypeSuffix}</span>}
                  </label>
                  <Input
                    value={form.stateCode || ""}
                    onChange={(e) => upd("stateCode", e.target.value === "" ? 0 : Number(e.target.value))}
                    type="number" placeholder="e.g. 27"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Address Line 1</label>
                  <Input value={form.addressLine1} onChange={(e) => upd("addressLine1", e.target.value)} placeholder="Street / building" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Address Line 2</label>
                  <Input value={form.addressLine2} onChange={(e) => upd("addressLine2", e.target.value)} placeholder="Area, city" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Email</label>
                  <Input value={form.email} onChange={(e) => upd("email", e.target.value)} type="email" placeholder="billing@vendor.com" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Phone</label>
                  <Input value={form.phone} onChange={(e) => upd("phone", e.target.value)} placeholder="Phone number" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Payment Terms (Days)</label>
                  <Input
                    value={form.defaultPaymentTermsDays || ""}
                    onChange={(e) => upd("defaultPaymentTermsDays", e.target.value === "" ? 0 : Number(e.target.value))}
                    type="number" min={1} placeholder="e.g. 30"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Notes</label>
                <Textarea value={form.notes} onChange={(e) => upd("notes", e.target.value)} rows={2} className="resize-y" placeholder="Internal notes..." />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={form.active} onCheckedChange={(c) => upd("active", Boolean(c))} />
                  <span>Active vendor</span>
                </label>
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={saveMutation.isPending} className="gradient-warm text-primary-foreground border-0 shadow-soft">
                  {editingVendor ? "Update Vendor" : "Save Vendor"}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancel}>Cancel</Button>
              </div>
            </form>
          </div>
        </motion.div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or GSTIN..." className="pl-10" />
        </div>
        <div className="flex gap-1.5 bg-muted rounded-xl p-1">
          {(["all", "active", "inactive"] as const).map((opt) => (
            <button key={opt} onClick={() => setFilter(opt)} className={`px-4 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${filter === opt ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        {isLoading && <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">Loading vendors…</div>}
        {!isLoading && vendors.length === 0 && (
          <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">
            No vendors found. Add your first vendor to start recording purchases.
          </div>
        )}
        {vendors.map((vendor, i) => (
          <motion.div key={vendor.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className="bg-card rounded-2xl border border-border p-5 shadow-soft hover:shadow-elevated transition-all duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h4 className="text-sm font-bold truncate">{vendor.name}</h4>
                  <StatusBadge status={vendor.active ? "active" : "inactive"} />
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 font-semibold">{VENDOR_CATEGORY_LABELS[vendor.category] ?? vendor.category}</span>
                </div>
                <p className="text-xs text-muted-foreground">{vendor.gstin || "No GSTIN"} · {vendor.state}{vendor.stateCode ? ` (${vendor.stateCode})` : ""}</p>
                {vendor.addressLines.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{vendor.addressLines.join(", ")}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-semibold">{vendor.defaultPaymentTermsDays}d terms</span>
                <Button variant="outline" size="sm" onClick={() => handleEdit(vendor)} className="text-xs h-8">Edit</Button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
