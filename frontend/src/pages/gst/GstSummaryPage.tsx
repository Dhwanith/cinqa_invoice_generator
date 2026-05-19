import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/services/api";
import { fetchGstSummary } from "@/services/gst-api";
import { currentFinancialYear, MONTHS } from "@/types/gst";

const FY_OPTIONS = ['24-25', '25-26', '26-27', '27-28'];

export default function GstSummaryPage() {
  const [fy, setFy] = useState(currentFinancialYear());

  const { data, isLoading } = useQuery({
    queryKey: ['gst-summary', fy],
    queryFn: () => fetchGstSummary(fy),
  });

  const returns = data?.returns || [];
  const imports = data?.imports || [];

  const grandTotals = returns.reduce((acc, r) => ({
    outward: acc.outward + r.outwardCgst + r.outwardSgst + r.outwardIgst,
    itc:     acc.itc     + r.netItcCgst  + r.netItcSgst  + r.netItcIgst,
    payable: acc.payable + r.netCgstPayable + r.netSgstPayable + r.netIgstPayable,
  }), { outward: 0, itc: 0, payable: 0 });

  return (
    <div>
      <PageHeader
        kicker="GST"
        title="GST Summary"
        description={`Annual GST overview for FY ${fy} — output tax, ITC, and net liability by month.`}
      />

      <div className="flex items-center gap-4 mb-6">
        <Select value={fy} onValueChange={setFy}>
          <SelectTrigger className="w-[120px] h-10 rounded-xl text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FY_OPTIONS.map((y) => <SelectItem key={y} value={y}>FY {y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Annual totals */}
      {returns.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Output Tax', value: formatCurrency(grandTotals.outward), color: 'text-foreground' },
            { label: 'Total ITC Claimed', value: formatCurrency(grandTotals.itc), color: 'text-success' },
            { label: 'Total Tax Paid', value: formatCurrency(grandTotals.payable), color: 'text-primary' },
          ].map((s) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border p-5 shadow-soft">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-1">{s.label}</p>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">FY {fy}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Month-wise table */}
      <div className="rounded-2xl border border-border overflow-hidden shadow-soft">
        <div className="bg-muted/50 px-5 py-3 border-b border-border flex items-center gap-2">
          <BarChart3 size={15} className="text-primary" />
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Month-wise GST Liability — FY {fy}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                {['Month', 'Outward IGST', 'Outward CGST', 'Outward SGST', 'ITC IGST', 'ITC CGST', 'ITC SGST', 'Net Payable', 'GSTR-3B', 'GSTR-2B'].map((h) => (
                  <th key={h} className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground first:text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : MONTHS.map((m) => {
                const ret = returns.find((r) => r.month === m.value);
                const imp = imports.find((i) => i.month === m.value);
                return (
                  <tr key={m.value} className={`border-t border-border ${ret ? 'hover:bg-muted/10' : 'opacity-40'} transition-colors`}>
                    <td className="px-4 py-3 font-semibold">{m.label}</td>
                    <td className="px-4 py-3 text-right">{ret ? formatCurrency(ret.outwardIgst) : '—'}</td>
                    <td className="px-4 py-3 text-right">{ret ? formatCurrency(ret.outwardCgst) : '—'}</td>
                    <td className="px-4 py-3 text-right">{ret ? formatCurrency(ret.outwardSgst) : '—'}</td>
                    <td className="px-4 py-3 text-right text-success">{ret ? formatCurrency(ret.netItcIgst) : '—'}</td>
                    <td className="px-4 py-3 text-right text-success">{ret ? formatCurrency(ret.netItcCgst) : '—'}</td>
                    <td className="px-4 py-3 text-right text-success">{ret ? formatCurrency(ret.netItcSgst) : '—'}</td>
                    <td className="px-4 py-3 text-right font-bold">{ret ? formatCurrency(ret.netIgstPayable + ret.netCgstPayable + ret.netSgstPayable) : '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {ret ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${ret.status === 'filed' ? 'bg-success/15 text-success' : 'bg-blue-500/15 text-blue-600'}`}>
                          {ret.status === 'filed' ? '✅ Filed' : '💾 Saved'}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {imp ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                          {imp.totalRecords} recs
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {returns.length > 0 && (
              <tfoot className="bg-muted/30 border-t-2 border-border">
                <tr>
                  <td className="px-4 py-3 font-bold text-xs uppercase tracking-[0.1em] text-muted-foreground">Annual Total</td>
                  <td colSpan={2} />
                  <td colSpan={3} className="px-4 py-3 text-right text-xs font-bold">
                    Total Output: {formatCurrency(grandTotals.outward)}
                  </td>
                  <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold text-success">
                    Total ITC: {formatCurrency(grandTotals.itc)}
                  </td>
                  <td className="px-4 py-3 text-right font-black">{formatCurrency(grandTotals.payable)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {returns.length === 0 && !isLoading && (
          <div className="p-12 text-center text-muted-foreground">
            No GSTR-3B data for FY {fy}. Compute and save returns from the GSTR-3B page.
          </div>
        )}
      </div>
    </div>
  );
}
