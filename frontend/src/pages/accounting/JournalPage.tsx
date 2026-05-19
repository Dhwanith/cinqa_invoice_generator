import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Plus, Trash2, X, LoaderCircle, BookOpen } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/services/api";
import { createJournal, deleteJournal, fetchAccounts, fetchJournals } from "@/services/accounting-api";
import type { JournalLine } from "@/types/accounting";
import { currentFyDateRange } from "@/types/accounting";

const emptyLine = (): JournalLine => ({ accountId: "", debit: 0, credit: 0, description: "" });

export default function JournalPage() {
  const qc = useQueryClient();
  const defaults = currentFyDateRange();
  const today = new Date().toISOString().slice(0, 10);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ date: today, description: "", lines: [emptyLine(), emptyLine()] });

  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["journals", defaults.dateFrom, defaults.dateTo],
    queryFn: () => fetchJournals({ dateFrom: defaults.dateFrom, dateTo: defaults.dateTo }),
  });

  const createMutation = useMutation({
    mutationFn: () => createJournal({ date: form.date, description: form.description, lines: form.lines.filter((l) => l.accountId && (l.debit > 0 || l.credit > 0)) }),
    onSuccess: () => { toast.success("Journal entry created."); setShowForm(false); setForm({ date: today, description: "", lines: [emptyLine(), emptyLine()] }); qc.invalidateQueries({ queryKey: ["journals"] }); },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteJournal,
    onSuccess: () => { toast.success("Deleted."); qc.invalidateQueries({ queryKey: ["journals"] }); },
    onError: (err) => toast.error((err as Error).message),
  });

  const updateLine = (i: number, field: keyof JournalLine, value: string | number) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, [field]: field === "debit" || field === "credit" ? Number(value) || 0 : value } : l) }));

  const totalDebit = form.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = form.lines.reduce((s, l) => s + l.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const incomeExpenseAccounts = accounts.filter((a) => ["income", "expense", "asset", "liability", "equity"].includes(a.type));
  const byType = (type: string) => incomeExpenseAccounts.filter((a) => a.type === type);

  return (
    <div>
      <PageHeader
        kicker="Accounting"
        title="Journal Entries"
        description="Record manual adjustments — depreciation, provisions, opening balances, and corrections."
        action={
          <Button onClick={() => setShowForm((v) => !v)} className="gradient-warm text-primary-foreground border-0 shadow-soft gap-2">
            <Plus size={16} /> New Entry
          </Button>
        }
      />

      {/* New entry form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-8 overflow-hidden">
            <div className="bg-card rounded-2xl border border-border shadow-soft p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <BookOpen size={18} className="text-primary" />
                  <h3 className="text-lg font-bold">New Journal Entry</h3>
                </div>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-muted"><X size={18} className="text-muted-foreground" /></button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 mb-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Date</label>
                  <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Description / Narration</label>
                  <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Monthly depreciation on equipment" required />
                </div>
              </div>

              {/* Journal Lines */}
              <div className="rounded-xl border border-border overflow-hidden mb-4">
                <div className="grid grid-cols-[1fr,1fr,120px,120px,36px] px-4 py-2 bg-muted/50 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  <div>Account</div>
                  <div>Description</div>
                  <div className="text-right">Debit (₹)</div>
                  <div className="text-right">Credit (₹)</div>
                  <div />
                </div>
                {form.lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr,1fr,120px,120px,36px] px-4 py-2 border-t border-border gap-2 items-center">
                    <Select value={line.accountId} onValueChange={(v) => updateLine(i, "accountId", v)}>
                      <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder="Select account…" /></SelectTrigger>
                      <SelectContent>
                        {["income", "expense", "asset", "liability", "equity"].map((type) => (
                          byType(type).length > 0 && (
                            <div key={type}>
                              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{type}</div>
                              {byType(type).map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
                            </div>
                          )
                        ))}
                      </SelectContent>
                    </Select>
                    <Input value={line.description || ""} onChange={(e) => updateLine(i, "description", e.target.value)} placeholder="Optional" className="h-8 text-xs" />
                    <Input type="number" min={0} step="any" value={line.debit || ""} onChange={(e) => { updateLine(i, "debit", e.target.value); if (Number(e.target.value) > 0) updateLine(i, "credit", 0); }} placeholder="0" className="h-8 text-xs text-right" />
                    <Input type="number" min={0} step="any" value={line.credit || ""} onChange={(e) => { updateLine(i, "credit", e.target.value); if (Number(e.target.value) > 0) updateLine(i, "debit", 0); }} placeholder="0" className="h-8 text-xs text-right" />
                    <button onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))} disabled={form.lines.length <= 2} className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-30">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {/* Totals */}
                <div className="grid grid-cols-[1fr,1fr,120px,120px,36px] px-4 py-2 border-t-2 border-border bg-muted/30 gap-2">
                  <div className="col-span-2 text-xs font-bold">Totals</div>
                  <div className={`text-right text-xs font-bold tabular-nums ${balanced ? "" : "text-destructive"}`}>{formatCurrency(totalDebit)}</div>
                  <div className={`text-right text-xs font-bold tabular-nums ${balanced ? "" : "text-destructive"}`}>{formatCurrency(totalCredit)}</div>
                  <div />
                </div>
              </div>

              {!balanced && (
                <p className="text-xs text-destructive mb-4">⚠️ Entry does not balance — difference of {formatCurrency(Math.abs(totalDebit - totalCredit))}</p>
              )}

              <div className="flex gap-3">
                <Button type="button" onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))} variant="outline" size="sm">
                  <Plus size={13} className="mr-1" /> Add Line
                </Button>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !balanced || !form.description} className="gradient-warm text-primary-foreground border-0">
                  {createMutation.isPending ? <><LoaderCircle size={14} className="animate-spin" /> Saving…</> : "Post Journal Entry"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Journal list */}
      <div className="space-y-2">
        {isLoading && <div className="bg-card rounded-2xl border border-border p-8 text-center text-muted-foreground">Loading…</div>}
        {!isLoading && entries.length === 0 && (
          <div className="bg-card rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            No manual journal entries yet. Use journals for depreciation, opening balances, and adjusting entries.
          </div>
        )}
        {entries.map((entry) => {
          const isExpanded = expandedId === entry.id;
          const totalDebit = (entry.journalLines || []).reduce((s, l) => s + Number(l.debit || 0), 0);
          return (
            <motion.div key={entry.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border shadow-soft overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">{entry.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(entry.date)} · {(entry.journalLines || []).length} lines</p>
                </div>
                <span className="text-sm font-bold tabular-nums">{formatCurrency(totalDebit)}</span>
                {isExpanded ? <ChevronUp size={16} className="text-muted-foreground shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
              </div>
              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="border-t border-border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="px-5 py-2 text-left font-semibold text-muted-foreground">Account</th>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Description</th>
                            <th className="px-5 py-2 text-right font-semibold text-muted-foreground">Debit</th>
                            <th className="px-5 py-2 text-right font-semibold text-muted-foreground">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(entry.journalLines || []).map((line, i) => (
                            <tr key={i} className="border-t border-border/30">
                              <td className="px-5 py-2 font-semibold">{(line.account as any)?.name || line.accountId}</td>
                              <td className="px-3 py-2 text-muted-foreground">{line.description || "—"}</td>
                              <td className="px-5 py-2 text-right tabular-nums">{Number(line.debit) > 0 ? formatCurrency(Number(line.debit)) : "—"}</td>
                              <td className="px-5 py-2 text-right tabular-nums">{Number(line.credit) > 0 ? formatCurrency(Number(line.credit)) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="border-t border-border px-5 py-3 flex justify-end">
                      <Button variant="outline" size="sm" className="text-xs h-7 gap-1 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => deleteMutation.mutate(entry.id)} disabled={deleteMutation.isPending}>
                        <Trash2 size={11} /> Delete Entry
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
