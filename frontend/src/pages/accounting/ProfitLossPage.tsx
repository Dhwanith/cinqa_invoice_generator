import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { CalendarIcon, Download, TrendingDown, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency } from "@/services/api";
import { fetchProfitLoss } from "@/services/accounting-api";
import { currentFyDateRange } from "@/types/accounting";

function DateBtn({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm flex items-center gap-2 text-left focus:outline-none focus:ring-2 focus:ring-ring">
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

function Row({ label, value, indent = false, bold = false, separator = false, positive }: { label: string; value: number; indent?: boolean; bold?: boolean; separator?: boolean; positive?: boolean }) {
  return (
    <>
      {separator && <div className="h-px bg-border my-1" />}
      <div className={`flex justify-between py-2 ${indent ? "pl-6" : ""} ${bold ? "font-bold" : ""}`}>
        <span className={`text-sm ${bold ? "text-foreground" : "text-muted-foreground"} ${indent ? "text-xs" : ""}`}>{label}</span>
        <span className={`text-sm font-semibold tabular-nums ${positive === false && value > 0 ? "text-destructive" : positive === true && value > 0 ? "text-success" : bold ? "text-foreground" : ""}`}>
          {formatCurrency(value)}
        </span>
      </div>
    </>
  );
}

export default function ProfitLossPage() {
  const defaults = currentFyDateRange();
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [queried, setQueried] = useState(defaults);

  const { data: report, isLoading, error } = useQuery({
    queryKey: ["pl-report", queried.dateFrom, queried.dateTo],
    queryFn: () => fetchProfitLoss(queried.dateFrom, queried.dateTo),
    enabled: Boolean(queried.dateFrom && queried.dateTo),
  });

  const copyReport = () => {
    if (!report) return;
    const lines = [
      `Profit & Loss Statement`,
      `Period: ${format(new Date(queried.dateFrom + "T00:00:00"), "dd MMM yyyy")} to ${format(new Date(queried.dateTo + "T00:00:00"), "dd MMM yyyy")}`,
      ``,
      `REVENUE`,
      `Revenue from IT Services        ${formatCurrency(report.revenue)}`,
      `Total Revenue                   ${formatCurrency(report.totalRevenue)}`,
      ``,
      `EXPENSES`,
      ...Object.entries(report.expenses).map(([k, v]) => `  ${k.padEnd(36)} ${formatCurrency(v as number)}`),
      `Total Expenses                  ${formatCurrency(report.totalExpenses)}`,
      ``,
      `Gross Profit                    ${formatCurrency(report.grossProfit)}`,
      `Net Profit                      ${formatCurrency(report.netProfit)}`,
    ].join("\n");
    navigator.clipboard.writeText(lines).then(() => alert("Copied to clipboard!"));
  };

  return (
    <div>
      <PageHeader
        kicker="Accounting"
        title="Profit & Loss"
        description="Revenue from invoices minus expenses from purchases and reimbursements."
      />

      {/* Period selector */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border shadow-soft p-5 mb-6">
        <div className="grid sm:grid-cols-[1fr,1fr,auto] gap-4 items-end">
          <DateBtn value={dateFrom} onChange={setDateFrom} label="From" />
          <DateBtn value={dateTo} onChange={setDateTo} label="To" />
          <Button onClick={() => setQueried({ dateFrom, dateTo })} className="gradient-warm text-primary-foreground border-0">
            Generate Report
          </Button>
        </div>
      </motion.div>

      {isLoading && <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">Computing P&L…</div>}
      {error && <div className="bg-destructive/5 rounded-2xl border border-destructive/30 p-4 text-sm text-destructive">{(error as Error).message}</div>}

      {report && !isLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Revenue", value: report.totalRevenue, icon: TrendingUp, color: "text-success" },
              { label: "Total Expenses", value: report.totalExpenses, icon: TrendingDown, color: "text-destructive" },
              { label: "Net Profit", value: report.netProfit, icon: null, color: report.netProfit >= 0 ? "text-success" : "text-destructive" },
            ].map((s) => (
              <div key={s.label} className="bg-card rounded-2xl border border-border p-4 shadow-soft">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-2xl font-black ${s.color}`}>{formatCurrency(s.value)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{report.invoiceCount} invoices</p>
              </div>
            ))}
          </div>

          {/* P&L Statement */}
          <div className="bg-card rounded-2xl border border-border shadow-soft">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <p className="text-xs text-muted-foreground">Profit & Loss Statement</p>
                <p className="text-sm font-bold">{format(new Date(queried.dateFrom + "T00:00:00"), "dd MMM yyyy")} → {format(new Date(queried.dateTo + "T00:00:00"), "dd MMM yyyy")}</p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={copyReport}>
                <Download size={13} /> Copy
              </Button>
            </div>

            <div className="px-6 py-4">
              {/* Revenue */}
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary mb-2">Revenue from Operations</p>
              <Row label="IT Consulting & Technology Services" value={report.revenue} indent />
              {report.otherIncome && Object.entries(report.otherIncome).map(([k, v]) => (
                <Row key={k} label={k} value={v as number} indent />
              ))}
              <Row label="Total Revenue" value={report.totalRevenue} bold separator />

              {/* Expenses */}
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mt-5 mb-2">Operating Expenses</p>
              {Object.entries(report.expenses).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k, v]) => (
                <Row key={k} label={k} value={v as number} indent />
              ))}
              <Row label="Total Expenses" value={report.totalExpenses} bold separator />

              {/* Profit */}
              <div className="mt-4 pt-4 border-t-2 border-border space-y-2">
                <Row label="Gross Profit / EBITDA" value={report.grossProfit} bold positive />
                <div className="h-px bg-border/50" />
                <Row label="Net Profit Before Tax" value={report.netProfit} bold positive />
              </div>

              {/* GST note */}
              {report.outputGst.total > 0 && (
                <div className="mt-4 p-4 rounded-xl bg-muted/30 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold">GST collected (not included in revenue — pass-through liability):</p>
                  {report.outputGst.cgst > 0 && <p>CGST: {formatCurrency(report.outputGst.cgst)}</p>}
                  {report.outputGst.sgst > 0 && <p>SGST: {formatCurrency(report.outputGst.sgst)}</p>}
                  {report.outputGst.igst > 0 && <p>IGST: {formatCurrency(report.outputGst.igst)}</p>}
                  <p className="font-bold">Total GST collected: {formatCurrency(report.outputGst.total)}</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
