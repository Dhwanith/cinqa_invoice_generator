import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, CheckCircle2, Edit2, Save } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency, formatDate } from "@/services/api";
import { fetchBalanceSheet, saveBankBalance, saveCapital } from "@/services/accounting-api";

function BSRow({ label, value, indent = false, bold = false, note }: { label: string; value: number; indent?: boolean; bold?: boolean; note?: string }) {
  return (
    <div className={`flex justify-between items-start py-2.5 border-b border-border/40 last:border-0 ${indent ? "pl-5" : ""}`}>
      <div>
        <span className={`text-sm ${bold ? "font-bold text-foreground" : "text-muted-foreground"}`}>{label}</span>
        {note && <p className="text-[10px] text-muted-foreground/60">{note}</p>}
      </div>
      <span className={`text-sm tabular-nums ${bold ? "font-black" : "font-semibold"}`}>{formatCurrency(value)}</span>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-soft overflow-hidden">
      <div className={`px-5 py-3 ${color}`}>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">{title}</p>
      </div>
      <div className="px-5 pb-2 pt-1">{children}</div>
    </div>
  );
}

export default function BalanceSheetPage() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [asOfDate, setAsOfDate] = useState(today);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [queried, setQueried] = useState(today);
  const [showBankForm, setShowBankForm] = useState(false);
  const [showCapForm, setShowCapForm] = useState(false);
  const [bankForm, setBankForm] = useState({ date: today, balance: "", notes: "" });
  const [capForm, setCapForm] = useState({ date: today, openingBalance: "", drawings: "", notes: "" });

  const { data: report, isLoading } = useQuery({
    queryKey: ["balance-sheet", queried],
    queryFn: () => fetchBalanceSheet(queried),
  });

  const bankMutation = useMutation({
    mutationFn: () => saveBankBalance({ date: bankForm.date, balance: Number(bankForm.balance), notes: bankForm.notes }),
    onSuccess: () => { toast.success("Bank balance saved."); setShowBankForm(false); qc.invalidateQueries({ queryKey: ["balance-sheet"] }); },
    onError: (err) => toast.error((err as Error).message),
  });

  const capMutation = useMutation({
    mutationFn: () => saveCapital({ date: capForm.date, openingBalance: Number(capForm.openingBalance), drawings: Number(capForm.drawings), notes: capForm.notes }),
    onSuccess: () => { toast.success("Capital entry saved."); setShowCapForm(false); qc.invalidateQueries({ queryKey: ["balance-sheet"] }); },
    onError: (err) => toast.error((err as Error).message),
  });

  const r = report;
  const imbalance = r ? Math.abs(r.assets.totalAssets - r.liabilities.totalLiabilities - r.capital.plugCapital) : 0;

  return (
    <div>
      <PageHeader
        kicker="Accounting"
        title="Balance Sheet"
        description="Assets, liabilities, and partners' capital as of a specific date."
      />

      {/* Date selector */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border shadow-soft p-5 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">As of Date</label>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <button type="button" className="rounded-xl border border-input bg-background px-4 py-2.5 text-sm flex items-center gap-2 text-left focus:outline-none focus:ring-2 focus:ring-ring">
                  <CalendarIcon size={13} className="shrink-0 text-muted-foreground" />
                  {asOfDate ? format(new Date(asOfDate + "T00:00:00"), "dd MMM yyyy") : "Pick date"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={asOfDate ? new Date(asOfDate + "T00:00:00") : undefined}
                  onSelect={(d) => { if (d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0"); setAsOfDate(`${y}-${m}-${day}`); setDatePickerOpen(false); } }} initialFocus />
              </PopoverContent>
            </Popover>
          </div>
          <Button onClick={() => setQueried(asOfDate)} className="gradient-warm text-primary-foreground border-0">Generate</Button>
        </div>
      </motion.div>

      {isLoading && <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">Computing Balance Sheet…</div>}

      {r && !isLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Balance indicator */}
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${imbalance < 1 ? "bg-success/10 border border-success/30 text-success" : "bg-amber-500/10 border border-amber-500/30 text-amber-700"}`}>
            {imbalance < 1 ? <CheckCircle2 size={16} /> : null}
            <span className="text-xs font-semibold">
              {imbalance < 1 ? "Balance Sheet is in balance ✅" : `Note: ₹${imbalance.toFixed(2)} difference — update bank balance or capital entries`}
            </span>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* ASSETS */}
            <Section title="Assets" color="bg-primary">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-3 pb-1">Current Assets</p>
              <div className="flex items-center justify-between py-2.5 border-b border-border/40">
                <div>
                  <span className="text-sm text-muted-foreground">Bank — Axis Bank</span>
                  {r.assets.bankDate && <p className="text-[10px] text-muted-foreground/60">as of {formatDate(r.assets.bankDate)}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{formatCurrency(r.assets.bankBalance)}</span>
                  <button onClick={() => { setBankForm({ date: today, balance: String(r.assets.bankBalance), notes: "" }); setShowBankForm(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors">
                    <Edit2 size={12} className="text-muted-foreground" />
                  </button>
                </div>
              </div>
              {/* Bank form */}
              <AnimatePresence>
                {showBankForm && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="py-3 space-y-3 border-b border-border">
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-[10px] font-semibold text-muted-foreground">Date</label><Input type="date" value={bankForm.date} onChange={(e) => setBankForm((f) => ({ ...f, date: e.target.value }))} className="h-8 text-xs" /></div>
                        <div><label className="text-[10px] font-semibold text-muted-foreground">Balance (₹)</label><Input type="number" value={bankForm.balance} onChange={(e) => setBankForm((f) => ({ ...f, balance: e.target.value }))} className="h-8 text-xs" placeholder="0" /></div>
                      </div>
                      <Input value={bankForm.notes} onChange={(e) => setBankForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" className="h-8 text-xs" />
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs gap-1 gradient-warm text-primary-foreground border-0" disabled={bankMutation.isPending} onClick={() => bankMutation.mutate()}>
                          <Save size={11} /> Save
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowBankForm(false)}>Cancel</Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <BSRow label="Accounts Receivable" value={r.assets.accountsReceivable} indent note="Unpaid tax invoices" />
              {r.assets.itcCgst > 0 && <BSRow label="ITC Receivable — CGST" value={r.assets.itcCgst} indent />}
              {r.assets.itcSgst > 0 && <BSRow label="ITC Receivable — SGST" value={r.assets.itcSgst} indent />}
              {r.assets.itcIgst > 0 && <BSRow label="ITC Receivable — IGST" value={r.assets.itcIgst} indent />}
              <BSRow label="Total Current Assets" value={r.assets.totalCurrentAssets} bold />
              <BSRow label="TOTAL ASSETS" value={r.assets.totalAssets} bold />
            </Section>

            {/* LIABILITIES + CAPITAL */}
            <div className="space-y-4">
              <Section title="Liabilities" color="bg-destructive/80">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-3 pb-1">Current Liabilities</p>
                <BSRow label="Accounts Payable" value={r.liabilities.accountsPayable} indent note="Unpaid purchases" />
                {r.liabilities.gstPayable !== null && (
                  <BSRow label="GST Payable (Net)" value={r.liabilities.gstPayable} indent note={r.liabilities.gstLabel || ""} />
                )}
                {r.liabilities.reimbursementsPayable > 0 && (
                  <BSRow label="Reimbursements Payable" value={r.liabilities.reimbursementsPayable} indent />
                )}
                <BSRow label="TOTAL LIABILITIES" value={r.liabilities.totalLiabilities} bold />
              </Section>

              <Section title="Partners' Capital" color="bg-blue-600">
                <div className="flex items-center justify-between pt-3 pb-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Partners' Capital Account</p>
                  <button onClick={() => { setCapForm({ date: today, openingBalance: String(r.capital.openingCapital), drawings: String(r.capital.drawings), notes: "" }); setShowCapForm(true); }} className="p-1 rounded-lg hover:bg-muted transition-colors">
                    <Edit2 size={12} className="text-muted-foreground" />
                  </button>
                </div>
                <AnimatePresence>
                  {showCapForm && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="py-3 space-y-3 border-b border-border">
                        <div className="grid grid-cols-3 gap-2">
                          <div><label className="text-[10px] font-semibold text-muted-foreground">Date</label><Input type="date" value={capForm.date} onChange={(e) => setCapForm((f) => ({ ...f, date: e.target.value }))} className="h-8 text-xs" /></div>
                          <div><label className="text-[10px] font-semibold text-muted-foreground">Opening (₹)</label><Input type="number" value={capForm.openingBalance} onChange={(e) => setCapForm((f) => ({ ...f, openingBalance: e.target.value }))} className="h-8 text-xs" /></div>
                          <div><label className="text-[10px] font-semibold text-muted-foreground">Drawings (₹)</label><Input type="number" value={capForm.drawings} onChange={(e) => setCapForm((f) => ({ ...f, drawings: e.target.value }))} className="h-8 text-xs" /></div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-xs gradient-warm text-primary-foreground border-0" disabled={capMutation.isPending} onClick={() => capMutation.mutate()}><Save size={11} /> Save</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCapForm(false)}>Cancel</Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {r.capital.openingCapital !== 0 && <BSRow label="Opening Capital Balance" value={r.capital.openingCapital} indent />}
                {r.capital.drawings !== 0 && <BSRow label="Less: Drawings" value={-r.capital.drawings} indent />}
                <BSRow label="Net Capital (Assets − Liabilities)" value={r.capital.plugCapital} bold note="Includes profit for the period" />
              </Section>

              {/* Balance check */}
              <div className="bg-muted/30 rounded-2xl border border-border p-4">
                <div className="flex justify-between text-sm">
                  <span className="font-bold">Total Liabilities + Capital</span>
                  <span className="font-black">{formatCurrency(r.liabilities.totalLiabilities + r.capital.plugCapital)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="font-bold">Total Assets</span>
                  <span className="font-black">{formatCurrency(r.assets.totalAssets)}</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
