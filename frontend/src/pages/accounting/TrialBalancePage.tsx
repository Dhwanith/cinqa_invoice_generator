import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, Download } from "lucide-react";
import { format } from "date-fns";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { formatCurrency } from "@/services/api";
import { fetchTrialBalance } from "@/services/accounting-api";
import { downloadCsv, TRIAL_BALANCE_CSV_HEADERS, trialBalanceLineToRow } from "@/lib/export";
import { currentFyDateRange, type AccountType } from "@/types/accounting";

const TYPE_ORDER: AccountType[] = ["income", "expense", "asset", "liability", "equity"];
const TYPE_LABEL: Record<AccountType, string> = {
  income: "Income", expense: "Expenses",
  asset: "Assets", liability: "Liabilities", equity: "Partners' Capital",
};
const TYPE_COLOR: Record<AccountType, string> = {
  income: "bg-success/10 text-success", expense: "bg-primary/10 text-primary",
  asset: "bg-blue-500/10 text-blue-600", liability: "bg-destructive/10 text-destructive",
  equity: "bg-muted text-muted-foreground",
};

function DateBtn({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="rounded-xl border border-input bg-background px-4 py-2.5 text-sm flex items-center gap-2 text-left focus:outline-none focus:ring-2 focus:ring-ring">
            <CalendarIcon size={13} className="shrink-0 text-muted-foreground" />
            {value ? format(new Date(value + "T00:00:00"), "dd MMM yyyy") : "Pick date"}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={value ? new Date(value + "T00:00:00") : undefined}
            onSelect={(d) => { if (d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0"); onChange(`${y}-${m}-${day}`); setOpen(false); } }} initialFocus />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function TrialBalancePage() {
  const defaults = currentFyDateRange();
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [queried, setQueried] = useState(defaults);

  const { data: report, isLoading } = useQuery({
    queryKey: ["trial-balance", queried.dateFrom, queried.dateTo],
    queryFn: () => fetchTrialBalance(queried.dateFrom, queried.dateTo),
    enabled: Boolean(queried.dateFrom && queried.dateTo),
  });

  const grouped = report
    ? TYPE_ORDER.reduce<Record<string, typeof report.lines>>((acc, type) => {
        const items = report.lines.filter((l) => l.type === type && (l.debit > 0 || l.credit > 0));
        if (items.length) acc[type] = items;
        return acc;
      }, {})
    : {};

  return (
    <div>
      <PageHeader kicker="Accounting" title="Trial Balance" description="Summarised debit and credit balances for the period — verifies the books are in balance."
        action={report ? (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => downloadCsv(`trial-balance-${queried.dateTo}.csv`, TRIAL_BALANCE_CSV_HEADERS, report.lines.map(trialBalanceLineToRow))}>
            <Download size={13} /> Export CSV
          </Button>
        ) : undefined}
      />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border shadow-soft p-5 mb-6">
        <div className="grid sm:grid-cols-[1fr,1fr,auto] gap-4 items-end">
          <DateBtn value={dateFrom} onChange={setDateFrom} label="From" />
          <DateBtn value={dateTo} onChange={setDateTo} label="To" />
          <Button onClick={() => setQueried({ dateFrom, dateTo })} className="gradient-warm text-primary-foreground border-0">Generate</Button>
        </div>
      </motion.div>

      {isLoading && <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">Computing Trial Balance…</div>}

      {report && !isLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Balance indicator */}
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${report.balanced ? "bg-success/10 border border-success/30 text-success" : "bg-amber-500/10 border border-amber-500/30 text-amber-700"}`}>
            {report.balanced ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span className="text-sm font-semibold">
              {report.balanced
                ? "✅ Trial Balance is in balance"
                : `⚠️ Out of balance by ${formatCurrency(Math.abs(report.difference))} — enter bank balance or capital entries to reconcile`}
            </span>
          </div>

          {/* Trial Balance table */}
          <div className="rounded-2xl border border-border overflow-hidden shadow-soft">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground w-16">Code</th>
                  <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Account</th>
                  <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground w-36">Debit</th>
                  <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground w-36">Credit</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([type, lines]) => (
                  <>
                    <tr key={`header-${type}`} className="bg-muted/20">
                      <td colSpan={4} className="px-5 py-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${TYPE_COLOR[type as AccountType]}`}>
                          {TYPE_LABEL[type as AccountType]}
                        </span>
                      </td>
                    </tr>
                    {lines.map((line, i) => (
                      <tr key={`${type}-${i}`} className="border-t border-border/30 hover:bg-muted/10 transition-colors">
                        <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">{line.code}</td>
                        <td className="px-3 py-2.5">{line.name}</td>
                        <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{line.debit > 0 ? formatCurrency(line.debit) : "—"}</td>
                        <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{line.credit > 0 ? formatCurrency(line.credit) : "—"}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/30">
                <tr>
                  <td colSpan={2} className="px-5 py-3 font-black text-sm">TOTAL</td>
                  <td className="px-5 py-3 text-right font-black text-sm tabular-nums">{formatCurrency(report.totalDebit)}</td>
                  <td className="px-5 py-3 text-right font-black text-sm tabular-nums">{formatCurrency(report.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
