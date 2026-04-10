import { type FormEvent, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Search, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import type { Client } from "@/types/invoice";
import { createClient, fetchClients, type CreateClientPayload, updateClient } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const defaultFormState: CreateClientPayload = {
  name: "",
  gstin: "",
  state: "",
  stateCode: 24,
  addressLine1: "",
  addressLine2: "",
  defaultSac: "998314",
  defaultPaymentTermsDays: 10,
  email: "",
  phone: "",
  active: true,
  notes: "",
};

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formState, setFormState] = useState<CreateClientPayload>(defaultFormState);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients", search, filter],
    queryFn: () => fetchClients({ search, active: filter }),
  });

  const filteredClients = useMemo(() => clients, [clients]);

  const saveClientMutation = useMutation({
    mutationFn: async (payload: CreateClientPayload) => {
      if (editingClient) {
        return updateClient(editingClient.id, payload);
      }

      return createClient(payload);
    },
    onSuccess: (client) => {
      toast.success(editingClient ? `Updated ${client.name}` : `Saved ${client.name}`);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      handleCancel();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to save client.");
    },
  });

  const updateField = <K extends keyof CreateClientPayload>(field: K, value: CreateClientPayload[K]) => {
    setFormState((current) => ({ ...current, [field]: value }));
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormState({
      name: client.name,
      gstin: client.gstin,
      state: client.state,
      stateCode: client.stateCode,
      addressLine1: client.addressLines[0] || "",
      addressLine2: client.addressLines[1] || "",
      defaultSac: client.defaultSac || "998314",
      defaultPaymentTermsDays: client.defaultPaymentTermsDays || 10,
      email: client.email || "",
      phone: client.phone || "",
      active: client.active,
      notes: client.notes || "",
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setEditingClient(null);
    setFormState(defaultFormState);
    setShowForm(false);
  };

  const handleToggleForm = () => {
    if (showForm) {
      handleCancel();
      return;
    }

    setEditingClient(null);
    setFormState(defaultFormState);
    setShowForm(true);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    saveClientMutation.mutate(formState);
  };

  return (
    <div>
      <PageHeader
        kicker="Registry"
        title="Clients"
        description="Manage your client database. Add, edit, and track client status."
        action={
          <Button onClick={handleToggleForm} className="gradient-warm text-primary-foreground border-0 shadow-soft hover:shadow-elevated hover:-translate-y-0.5 transition-all">
            <Plus size={16} className="mr-2" /> Add Client
          </Button>
        }
      />

      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-8">
          <div className="bg-card rounded-2xl border border-border shadow-soft p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">{editingClient ? `Edit ${editingClient.name}` : "Add New Client"}</h3>
              <button type="button" onClick={handleCancel} className="p-2 rounded-xl hover:bg-muted transition-colors">
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            <form className="grid gap-5" onSubmit={handleSubmit}>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Client Name</label>
                  <Input value={formState.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Enter client name" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">GSTIN</label>
                  <Input value={formState.gstin} onChange={(e) => updateField("gstin", e.target.value.toUpperCase())} placeholder="15-character GSTIN" required maxLength={15} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">State</label>
                  <Input value={formState.state} onChange={(e) => updateField("state", e.target.value)} placeholder="State" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">State Code</label>
                  <Input value={formState.stateCode} onChange={(e) => updateField("stateCode", Number(e.target.value))} type="number" placeholder="e.g. 24" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Address Line 1</label>
                  <Input value={formState.addressLine1} onChange={(e) => updateField("addressLine1", e.target.value)} placeholder="Street address" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Address Line 2</label>
                  <Input value={formState.addressLine2} onChange={(e) => updateField("addressLine2", e.target.value)} placeholder="City, area" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Default SAC</label>
                  <Input value={formState.defaultSac} onChange={(e) => updateField("defaultSac", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Payment Terms (Days)</label>
                  <Input value={formState.defaultPaymentTermsDays} onChange={(e) => updateField("defaultPaymentTermsDays", Number(e.target.value))} type="number" min={1} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Email</label>
                  <Input value={formState.email} onChange={(e) => updateField("email", e.target.value)} type="email" placeholder="billing@example.com" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Phone</label>
                  <Input value={formState.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="Phone number" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Notes</label>
                <textarea value={formState.notes} onChange={(e) => updateField("notes", e.target.value)} rows={2} className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" placeholder="Internal notes..." />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formState.active} onChange={(e) => updateField("active", e.target.checked)} className="w-4 h-4 rounded accent-primary" />
                  <span>Active client</span>
                </label>
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={saveClientMutation.isPending} className="gradient-warm text-primary-foreground border-0 shadow-soft">
                  {editingClient ? "Update Client" : "Save Client"}
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
          {(["all", "active", "inactive"] as const).map((option) => (
            <button key={option} onClick={() => setFilter(option)} className={`px-4 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${filter === option ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        {isLoading && <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">Loading clients…</div>}
        {!isLoading && filteredClients.length === 0 && (
          <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">No clients found.</div>
        )}
        {filteredClients.map((client, index) => (
          <motion.div key={client.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="bg-card rounded-2xl border border-border p-5 shadow-soft hover:shadow-elevated transition-all duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h4 className="text-sm font-bold truncate">{client.name}</h4>
                  <StatusBadge status={client.active ? "active" : "inactive"} />
                </div>
                <p className="text-xs text-muted-foreground">{client.gstin} · {client.state} ({client.stateCode})</p>
                <p className="text-xs text-muted-foreground mt-1">{client.addressLines.join(", ")}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-accent text-accent-foreground font-semibold">SAC {client.defaultSac}</span>
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-semibold">{client.defaultPaymentTermsDays}d terms</span>
                <Button variant="outline" size="sm" onClick={() => handleEdit(client)} className="text-xs h-8">Edit</Button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}