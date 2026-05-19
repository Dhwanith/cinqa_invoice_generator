import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarRange, CheckCircle2, Copy, FileDown, LoaderCircle, RefreshCw, Save } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/services/api";
import { computeGstr3b, fetchGstr3bReturns, markGstr3bFiled, saveGstr3b } from "@/services/gst-api";
import type { Gstr3bComputed } from "@/types/gst";
import { MONTHS, currentFinancialYear, periodLabel } from "@/types/gst";

function TaxRow({ label, igst, cgst, sgst, bold = false }: { label: string; igst: number; cgst: number; sgst: number; bold?: boolean }) {
  const cls = bold ? 'font-black text-base text-foreground' : 'font-semibold text-sm';
  return (
    <div className={`grid grid-cols-[1fr,120px,120px,120px] gap-2 py-2.5 border-b border-border last:border-0 items-center ${bold ? 'bg-muted/30 -mx-5 px-5 rounded-xl' : ''}`}>
      <span className={`text-sm ${bold ? 'font-bold' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`text-right ${cls} ${igst > 0 ? '' : 'text-muted-foreground/40'}`}>{formatCurrency(igst)}</span>
      <span className={`text-right ${cls} ${cgst > 0 ? '' : 'text-muted-foreground/40'}`}>{formatCurrency(cgst)}</span>
      <span className={`text-right ${cls} ${sgst > 0 ? '' : 'text-muted-foreground/40'}`}>{formatCurrency(sgst)}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-soft p-5 mb-4">
      <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-primary mb-4">{title}</h4>
      <div className="grid grid-cols-[1fr,120px,120px,120px] gap-2 mb-2">
        <span />
        {['IGST', 'CGST', 'SGST'].map((h) => <span key={h} className="text-right text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{h}</span>)}
      </div>
      {children}
    </div>
  );
}

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied.`)).catch(() => toast.error('Copy failed.'));
}

export default function Gstr3bPage() {
  const [fy, setFy] = useState(currentFinancialYear());
  const [month, setMonth] = useState(new Date().getMonth() < 3 ? new Date().getMonth() + 1 : new Date().getMonth() + 1);
  const [computed, setComputed] = useState<Gstr3bComputed | null>(null);
  const [notes, setNotes] = useState('');
  const [filedRef, setFiledRef] = useState('');
  const [filedDate, setFiledDate] = useState(new Date().toISOString().slice(0, 10));
  const [savedReturnId, setSavedReturnId] = useState<string | null>(null);
  const [showFiledForm, setShowFiledForm] = useState(false);

  const { data: returns = [] } = useQuery({ queryKey: ['gstr3b-returns'], queryFn: fetchGstr3bReturns });

  const computeMutation = useMutation({
    mutationFn: () => computeGstr3b(fy, month),
    onSuccess: (data) => {
      setComputed(data);
      toast.success(`Computed for ${periodLabel(fy, month)} — ${data.invoiceCount} invoices, ${data.purchaseCount} purchases.`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Computation failed.'),
  });

  const saveMutation = useMutation({
    mutationFn: () => saveGstr3b({ financialYear: fy, month, periodLabel: periodLabel(fy, month), computed: computed!, notes }),
    onSuccess: (ret) => {
      setSavedReturnId(ret.id);
      toast.success('GSTR-3B saved.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Save failed.'),
  });

  const fileMutation = useMutation({
    mutationFn: () => markGstr3bFiled(savedReturnId!, filedDate, filedRef),
    onSuccess: () => { toast.success('Marked as filed!'); setShowFiledForm(false); },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed.'),
  });

  const existingReturn = returns.find((r) => r.financialYear === fy && r.month === month);

  const buildCopyText = () => {
    if (!computed) return '';
    const { outward, rcm, itcAvailable, itcReversed, netItc, netPayable } = computed;
    return `GSTR-3B — ${periodLabel(fy, month)}

3.1(a) Outward Taxable Supplies:
  Taxable Value: ${formatCurrency(outward.taxableValue)}
  IGST: ${formatCurrency(outward.igst)} | CGST: ${formatCurrency(outward.cgst)} | SGST: ${formatCurrency(outward.sgst)}

3.1(d) RCM Inward Supplies:
  Taxable Value: ${formatCurrency(rcm.taxableValue)}
  IGST: ${formatCurrency(rcm.igst)} | CGST: ${formatCurrency(rcm.cgst)} | SGST: ${formatCurrency(rcm.sgst)}

4A(5) ITC Available:
  IGST: ${formatCurrency(itcAvailable.igst)} | CGST: ${formatCurrency(itcAvailable.cgst)} | SGST: ${formatCurrency(itcAvailable.sgst)}

4B ITC Reversed:
  IGST: ${formatCurrency(itcReversed.igst)} | CGST: ${formatCurrency(itcReversed.cgst)} | SGST: ${formatCurrency(itcReversed.sgst)}

4C Net ITC:
  IGST: ${formatCurrency(netItc.igst)} | CGST: ${formatCurrency(netItc.cgst)} | SGST: ${formatCurrency(netItc.sgst)}

6.1 NET TAX PAYABLE:
  IGST: ${formatCurrency(netPayable.igst)} | CGST: ${formatCurrency(netPayable.cgst)} | SGST: ${formatCurrency(netPayable.sgst)}
  TOTAL: ${formatCurrency(netPayable.igst + netPayable.cgst + netPayable.sgst)}
`;
  };

  return (
    <div>
      <PageHeader
        kicker="GST"
        title="GSTR-3B Filing"
        description="Auto-compute your monthly GSTR-3B from invoices, purchases, and reimbursements."
      />

      {/* Period selector */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border shadow-soft p-5 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2 mb-1">
            <CalendarRange size={16} className="text-primary" />
            <span className="text-sm font-bold">Select Period</span>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Financial Year</label>
              <Select value={fy} onValueChange={(v) => { setFy(v); setComputed(null); }}>
                <SelectTrigger className="w-[110px] h-10 rounded-xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['25-26', '26-27', '27-28'].map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Month</label>
              <Select value={String(month)} onValueChange={(v) => { setMonth(Number(v)); setComputed(null); }}>
                <SelectTrigger className="w-[130px] h-10 rounded-xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => computeMutation.mutate()} disabled={computeMutation.isPending} className="gradient-warm text-primary-foreground border-0 gap-2">
              {computeMutation.isPending ? <><LoaderCircle size={14} className="animate-spin" /> Computing…</> : <><RefreshCw size={14} /> Compute from Data</>}
            </Button>
          </div>
          {existingReturn && (
            <div className={`ml-auto px-3 py-1.5 rounded-xl text-xs font-semibold border ${existingReturn.status === 'filed' ? 'bg-success/10 text-success border-success/30' : 'bg-blue-500/10 text-blue-600 border-blue-500/30'}`}>
              {existingReturn.status === 'filed' ? `✅ Filed — ${existingReturn.filedReference}` : `💾 Saved (${existingReturn.status})`}
            </div>
          )}
        </div>
      </motion.div>

      {/* Computed GSTR-3B */}
      <AnimatePresence>
        {computed && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

            {/* Data source summary */}
            <div className="flex gap-3 mb-5 flex-wrap">
              {[
                { label: `${computed.invoiceCount} invoices`, sub: `${periodLabel(fy, month)}`, color: 'bg-primary/5 border-primary/20 text-primary' },
                { label: `${computed.purchaseCount} purchases`, sub: 'ITC computed', color: 'bg-blue-500/5 border-blue-500/20 text-blue-600' },
                { label: `ITC from reimbursements`, sub: formatCurrency(computed.reimbursementItc), color: 'bg-amber-500/5 border-amber-500/20 text-amber-700' },
              ].map((s) => (
                <div key={s.label} className={`px-4 py-2 rounded-xl border text-xs font-semibold ${s.color}`}>
                  {s.label} · <span className="opacity-70">{s.sub}</span>
                </div>
              ))}
            </div>

            {/* Section 3.1 — Outward */}
            <Section title="3.1 — Outward Supplies">
              <TaxRow label="(a) Outward taxable supplies (B2B tax invoices)" igst={computed.outward.igst} cgst={computed.outward.cgst} sgst={computed.outward.sgst} />
              <div className="py-2.5 border-b border-border text-sm text-muted-foreground">
                <span className="font-medium">Taxable Value: </span>{formatCurrency(computed.outward.taxableValue)}
              </div>
              <TaxRow label="(b) Zero-rated outward supplies" igst={0} cgst={0} sgst={0} />
              <TaxRow label="(c) Nil rated / Exempt" igst={0} cgst={0} sgst={0} />
              <TaxRow label="(d) Inward supplies under Reverse Charge (RCM)" igst={computed.rcm.igst} cgst={computed.rcm.cgst} sgst={computed.rcm.sgst} />
            </Section>

            {/* Section 4 — ITC */}
            <Section title="4 — Eligible Input Tax Credit">
              <TaxRow label="4A(5) — All other ITC (purchases + reimbursements)" igst={computed.itcAvailable.igst} cgst={computed.itcAvailable.cgst} sgst={computed.itcAvailable.sgst} />
              <TaxRow label="4B — ITC Reversed (restricted / blocked purchases)" igst={computed.itcReversed.igst} cgst={computed.itcReversed.cgst} sgst={computed.itcReversed.sgst} />
              <TaxRow label="4C — Net ITC Available (4A − 4B)" igst={computed.netItc.igst} cgst={computed.netItc.cgst} sgst={computed.netItc.sgst} bold />
            </Section>

            {/* Net Payable */}
            <div className="bg-card rounded-2xl border-2 border-primary/20 shadow-elevated p-5 mb-5">
              <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-primary mb-4">6.1 — Net Tax Payable to Government</h4>
              <div className="grid grid-cols-[1fr,120px,120px,120px] gap-2 mb-2">
                <span />
                {['IGST', 'CGST', 'SGST'].map((h) => <span key={h} className="text-right text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{h}</span>)}
              </div>
              <TaxRow label="Output Tax (3.1a + 3.1d)" igst={computed.outward.igst + computed.rcm.igst} cgst={computed.outward.cgst + computed.rcm.cgst} sgst={computed.outward.sgst + computed.rcm.sgst} />
              <TaxRow label="Less: Net ITC (4C)" igst={-computed.netItc.igst} cgst={-computed.netItc.cgst} sgst={-computed.netItc.sgst} />
              <TaxRow label="NET PAYABLE" igst={computed.netPayable.igst} cgst={computed.netPayable.cgst} sgst={computed.netPayable.sgst} bold />
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Grand Total Payable</p>
                  <p className="text-3xl font-black text-primary">{formatCurrency(computed.netPayable.igst + computed.netPayable.cgst + computed.netPayable.sgst)}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => copyToClipboard(buildCopyText(), 'GSTR-3B summary')}>
                    <Copy size={13} /> Copy for Portal
                  </Button>
                </div>
              </div>
            </div>

            {/* Notes + Save */}
            <div className="bg-card rounded-2xl border border-border shadow-soft p-5 mb-5">
              <h4 className="text-sm font-bold mb-3">Notes</h4>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Notes for CA / internal reference..." />
            </div>

            <div className="flex flex-wrap gap-3 mb-8">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gradient-warm text-primary-foreground border-0 gap-2">
                {saveMutation.isPending ? <><LoaderCircle size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save GSTR-3B</>}
              </Button>
              {savedReturnId && (
                <Button variant="outline" className="gap-2 border-success text-success hover:bg-success/5" onClick={() => setShowFiledForm(true)}>
                  <CheckCircle2 size={14} /> Mark as Filed
                </Button>
              )}
            </div>

            {/* Filed form */}
            <AnimatePresence>
              {showFiledForm && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="bg-success/5 rounded-2xl border border-success/30 p-5 mb-5">
                  <p className="text-sm font-bold text-success mb-4">✅ Mark as Filed on GST Portal</p>
                  <div className="grid sm:grid-cols-2 gap-4 mb-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Date Filed</label>
                      <Input type="date" value={filedDate} onChange={(e) => setFiledDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">ARN / Reference Number</label>
                      <Input value={filedRef} onChange={(e) => setFiledRef(e.target.value)} placeholder="ARN-..." />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button className="bg-success text-white border-0 hover:bg-success/90 gap-2" disabled={fileMutation.isPending} onClick={() => fileMutation.mutate()}>
                      {fileMutation.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Confirm Filed
                    </Button>
                    <Button variant="outline" onClick={() => setShowFiledForm(false)}>Cancel</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Past returns */}
      {returns.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-[0.14em]">Past Returns</h3>
          <div className="rounded-2xl border border-border overflow-hidden shadow-soft">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>{['Period', 'Output Tax', 'ITC', 'Net Payable', 'Status'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">{h}</th>)}</tr>
              </thead>
              <tbody>
                {returns.map((ret) => (
                  <tr key={ret.id} className="border-t border-border hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 font-semibold">{ret.periodLabel}</td>
                    <td className="px-4 py-3">{formatCurrency(ret.outwardCgst + ret.outwardSgst + ret.outwardIgst)}</td>
                    <td className="px-4 py-3 text-success">{formatCurrency(ret.netItcCgst + ret.netItcSgst + ret.netItcIgst)}</td>
                    <td className="px-4 py-3 font-bold">{formatCurrency(ret.netCgstPayable + ret.netSgstPayable + ret.netIgstPayable)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${ret.status === 'filed' ? 'bg-success/15 text-success' : ret.status === 'saved' ? 'bg-blue-500/15 text-blue-600' : 'bg-muted text-muted-foreground'}`}>
                        {ret.status === 'filed' && '✅'} {ret.status.charAt(0).toUpperCase() + ret.status.slice(1)}
                        {ret.status === 'filed' && ret.filedReference && <span className="text-[10px] opacity-70">· {ret.filedReference}</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
