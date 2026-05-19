import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, CheckCircle2, FileUp, Search, Upload,
  XCircle, HelpCircle, RefreshCw, X, LoaderCircle,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/services/api";
import {
  fetchBooksOnlyPurchases, fetchGstr2bImports, fetchGstr2bRecords, importGstr2b,
} from "@/services/gst-api";
import { parseGstr2bCsv } from "@/lib/gstr2b-parser";
import type { Gstr2bRecord } from "@/types/gst";
import { MONTHS, currentFinancialYear, periodLabel } from "@/types/gst";

type ReconTab = 'all' | 'matched' | 'amount_mismatch' | 'unmatched' | 'books_only';

const TAB_CONFIG: Record<ReconTab, { label: string; icon: React.ReactNode; color: string }> = {
  all:              { label: 'All',              icon: null,                                            color: '' },
  matched:          { label: 'Matched',          icon: <CheckCircle2 size={13} />,                     color: 'text-success' },
  amount_mismatch:  { label: 'Amount Mismatch',  icon: <AlertTriangle size={13} />,                    color: 'text-amber-600' },
  unmatched:        { label: 'In GSTR-2B Only',  icon: <HelpCircle size={13} />,                       color: 'text-blue-600' },
  books_only:       { label: 'In Books Only 🔴', icon: <XCircle size={13} />,                          color: 'text-destructive' },
};

function ReconciliationBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    matched:         { label: '✅ Matched',           cls: 'bg-success/10 text-success border-success/30' },
    amount_mismatch: { label: '⚠️ Amount Mismatch',   cls: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
    unmatched:       { label: '📭 Not in Books',       cls: 'bg-blue-500/10 text-blue-700 border-blue-500/30' },
    manually_matched:{ label: '🔗 Manually Matched',  cls: 'bg-primary/10 text-primary border-primary/30' },
    books_only:      { label: '🔴 ITC at Risk',        cls: 'bg-destructive/10 text-destructive border-destructive/30' },
  };
  const cfg = map[status] || { label: status, cls: 'bg-muted text-muted-foreground border-border' };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.cls}`}>{cfg.label}</span>;
}

export default function Gstr2bPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fy, setFy] = useState(currentFinancialYear());
  const [month, setMonth] = useState(new Date().getMonth() < 3 ? new Date().getMonth() + 1 : new Date().getMonth() + 1);
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReconTab>('all');
  const [search, setSearch] = useState('');
  const [parsePreview, setParsePreview] = useState<{ records: any[]; filename: string; errors: string[] } | null>(null);

  const { data: imports = [], isLoading: importsLoading } = useQuery({
    queryKey: ['gstr2b-imports'],
    queryFn: fetchGstr2bImports,
  });

  const { data: records = [], isLoading: recordsLoading } = useQuery({
    queryKey: ['gstr2b-records', selectedImportId],
    queryFn: () => fetchGstr2bRecords(selectedImportId!),
    enabled: Boolean(selectedImportId),
  });

  const { data: booksOnly = [], isLoading: booksLoading } = useQuery({
    queryKey: ['gstr2b-books-only', selectedImportId],
    queryFn: () => fetchBooksOnlyPurchases(selectedImportId!),
    enabled: Boolean(selectedImportId) && activeTab === 'books_only',
  });

  const importMutation = useMutation({
    mutationFn: importGstr2b,
    onSuccess: (imp) => {
      toast.success(`Imported ${imp.totalRecords} records. ${imp.matchedRecords} matched.`);
      setParsePreview(null);
      setSelectedImportId(imp.id);
      qc.invalidateQueries({ queryKey: ['gstr2b-imports'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Import failed.'),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseGstr2bCsv(text);
      if (result.records.length === 0 && result.errors.length > 0) {
        toast.error(result.errors[0]);
        return;
      }
      setParsePreview({ records: result.records, filename: file.name, errors: result.errors });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmImport = () => {
    if (!parsePreview) return;
    const pLabel = periodLabel(fy, month);
    importMutation.mutate({ financialYear: fy, month, periodLabel: pLabel, filename: parsePreview.filename, records: parsePreview.records });
  };

  // Filter records
  const selectedImport = imports.find((i) => i.id === selectedImportId);

  const filteredRecords = records.filter((r) => {
    if (activeTab !== 'all' && activeTab !== 'books_only' && r.reconciliationStatus !== activeTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.supplierName.toLowerCase().includes(q) || r.supplierGstin.includes(q) || r.invoiceNo.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredBooksOnly = booksOnly.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.vendorName.toLowerCase().includes(q) || p.vendorGstin.includes(q) || p.purchaseNumber.toLowerCase().includes(q);
  });

  // Stats from records
  const stats = {
    matched:    records.filter((r) => r.reconciliationStatus === 'matched').length,
    mismatch:   records.filter((r) => r.reconciliationStatus === 'amount_mismatch').length,
    unmatched:  records.filter((r) => r.reconciliationStatus === 'unmatched').length,
    totalItc:   records.reduce((s, r) => s + r.igst + r.cgst + r.sgst, 0),
    safeItc:    records.filter((r) => r.reconciliationStatus === 'matched').reduce((s, r) => s + r.igst + r.cgst + r.sgst, 0),
    riskItc:    booksOnly.reduce((s, p) => s + p.cgst + p.sgst + p.igst, 0),
  };

  return (
    <div>
      <PageHeader
        kicker="GST"
        title="GSTR-2B Reconciliation"
        description="Import your GSTR-2B CSV and compare it against your purchase records to validate ITC claims."
      />

      {/* Import panel */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-border shadow-soft p-5 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Financial Year</label>
            <Select value={fy} onValueChange={setFy}>
              <SelectTrigger className="w-[110px] h-10 rounded-xl text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['25-26', '26-27', '27-28'].map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Month</label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[130px] h-10 rounded-xl text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1" />
          <input type="file" accept=".csv,.txt" ref={fileRef} className="hidden" onChange={handleFileChange} />
          <Button onClick={() => fileRef.current?.click()} variant="outline" className="gap-2">
            <FileUp size={16} /> Upload GSTR-2B CSV
          </Button>
        </div>

        {/* Parse preview */}
        {parsePreview && (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-bold">{parsePreview.filename}</p>
                <p className="text-xs text-muted-foreground">{parsePreview.records.length} records parsed · Period: {periodLabel(fy, month)}</p>
                {parsePreview.errors.map((e, i) => <p key={i} className="text-xs text-amber-600 mt-1">⚠️ {e}</p>)}
              </div>
              <button onClick={() => setParsePreview(null)}><X size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-card mb-3 max-h-48">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>{['Supplier GSTIN', 'Supplier Name', 'Invoice No', 'Date', 'Taxable', 'IGST', 'CGST', 'SGST', 'ITC'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {parsePreview.records.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono">{r.supplierGstin}</td>
                      <td className="px-3 py-1.5 max-w-[160px] truncate">{r.supplierName}</td>
                      <td className="px-3 py-1.5">{r.invoiceNo}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{r.invoiceDate}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(r.taxableAmount)}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(r.igst)}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(r.cgst)}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(r.sgst)}</td>
                      <td className="px-3 py-1.5 text-center">{r.itcAvailable}</td>
                    </tr>
                  ))}
                  {parsePreview.records.length > 8 && <tr><td colSpan={9} className="px-3 py-2 text-muted-foreground text-center">…and {parsePreview.records.length - 8} more</td></tr>}
                </tbody>
              </table>
            </div>
            <Button onClick={handleConfirmImport} disabled={importMutation.isPending} className="gradient-warm text-primary-foreground border-0 gap-2">
              {importMutation.isPending ? <><LoaderCircle size={14} className="animate-spin" /> Importing…</> : <><Upload size={14} /> Confirm Import</>}
            </Button>
          </div>
        )}
      </motion.div>

      {/* Import history + select */}
      {imports.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {imports.map((imp) => (
            <button key={imp.id} onClick={() => setSelectedImportId(imp.id)}
              className={`px-4 py-2 rounded-xl border text-xs font-semibold transition-all ${selectedImportId === imp.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}>
              {imp.periodLabel} · {imp.totalRecords} records
            </button>
          ))}
        </div>
      )}

      {/* Reconciliation view */}
      {selectedImport && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* ITC Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total ITC in GSTR-2B', value: formatCurrency(selectedImport.totalItcIgst + selectedImport.totalItcCgst + selectedImport.totalItcSgst), color: 'text-foreground' },
              { label: 'Safe ITC (Matched)', value: formatCurrency(stats.safeItc), color: 'text-success' },
              { label: 'ITC at Risk (Books Only)', value: formatCurrency(stats.riskItc), color: 'text-destructive' },
              { label: 'Unreconciled Records', value: stats.unmatched, color: 'text-blue-600' },
            ].map((s) => (
              <div key={s.label} className="bg-card rounded-2xl border border-border p-4 shadow-soft">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search supplier, GSTIN, invoice no…" className="pl-10 text-sm" />
            </div>
            <div className="flex gap-1.5 bg-muted rounded-xl p-1 overflow-x-auto">
              {(Object.entries(TAB_CONFIG) as [ReconTab, typeof TAB_CONFIG[ReconTab]][]).map(([key, cfg]) => {
                const count = key === 'all' ? records.length + booksOnly.length
                  : key === 'books_only' ? booksOnly.length
                  : records.filter((r) => r.reconciliationStatus === key).length;
                return (
                  <button key={key} onClick={() => setActiveTab(key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${activeTab === key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    <span className={cfg.color}>{cfg.icon}</span>
                    {cfg.label}
                    {count > 0 && <span className="ml-1 text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">{count}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Records table */}
          {(recordsLoading || (activeTab === 'books_only' && booksLoading)) ? (
            <div className="bg-card rounded-2xl border border-border p-8 text-center text-muted-foreground">Loading…</div>
          ) : activeTab === 'books_only' ? (
            // Books Only — purchases without GSTR-2B match
            <div className="rounded-2xl border border-border overflow-hidden shadow-soft">
              <div className="px-4 py-3 bg-destructive/5 border-b border-border">
                <p className="text-sm font-bold text-destructive">⚠️ ITC at Risk — These purchases have no matching GSTR-2B entry</p>
                <p className="text-xs text-muted-foreground mt-0.5">Supplier has not filed GSTR-1 for these invoices. You cannot claim this ITC until they file.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>{['Vendor', 'GSTIN', 'Invoice No', 'Date', 'Taxable', 'CGST', 'SGST', 'IGST', 'ITC'].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold text-muted-foreground">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filteredBooksOnly.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">All purchases with GSTIN have corresponding GSTR-2B entries 🎉</td></tr>
                    ) : filteredBooksOnly.map((p) => (
                      <tr key={p.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-semibold max-w-[180px] truncate">{p.vendorName}</td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">{p.vendorGstin}</td>
                        <td className="px-4 py-2.5">{p.purchaseNumber || '—'}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(p.purchaseDate)}</td>
                        <td className="px-4 py-2.5 text-right">{formatCurrency(p.amount)}</td>
                        <td className="px-4 py-2.5 text-right">{formatCurrency(p.cgst)}</td>
                        <td className="px-4 py-2.5 text-right">{formatCurrency(p.sgst)}</td>
                        <td className="px-4 py-2.5 text-right">{formatCurrency(p.igst)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-destructive">{formatCurrency(p.cgst + p.sgst + p.igst)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {filteredBooksOnly.length > 0 && (
                    <tfoot className="bg-muted/30 border-t-2 border-border">
                      <tr>
                        <td colSpan={8} className="px-4 py-2 text-xs font-bold text-right text-destructive">Total ITC at Risk:</td>
                        <td className="px-4 py-2 text-right font-black text-destructive">{formatCurrency(filteredBooksOnly.reduce((s, p) => s + p.cgst + p.sgst + p.igst, 0))}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          ) : (
            // GSTR-2B records
            <div className="rounded-2xl border border-border overflow-hidden shadow-soft">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>{['Status', 'Supplier', 'GSTIN', 'Invoice No', 'Date', 'Taxable', 'CGST', 'SGST', 'IGST', 'ITC'].map((h) => <th key={h} className="px-3 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filteredRecords.length === 0 ? (
                      <tr><td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">No records found for this filter.</td></tr>
                    ) : filteredRecords.map((r) => (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/10 transition-colors">
                        <td className="px-3 py-2.5"><ReconciliationBadge status={r.reconciliationStatus} /></td>
                        <td className="px-3 py-2.5 font-semibold max-w-[160px] truncate">{r.supplierName}</td>
                        <td className="px-3 py-2.5 font-mono text-muted-foreground">{r.supplierGstin}</td>
                        <td className="px-3 py-2.5">{r.invoiceNo}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{r.invoiceDate ? formatDate(r.invoiceDate) : '—'}</td>
                        <td className="px-3 py-2.5 text-right">{formatCurrency(r.taxableAmount)}</td>
                        <td className="px-3 py-2.5 text-right">{r.cgst > 0 ? formatCurrency(r.cgst) : '—'}</td>
                        <td className="px-3 py-2.5 text-right">{r.sgst > 0 ? formatCurrency(r.sgst) : '—'}</td>
                        <td className="px-3 py-2.5 text-right">{r.igst > 0 ? formatCurrency(r.igst) : '—'}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={r.itcAvailable === 'Yes' ? 'text-success font-semibold' : 'text-destructive'}>{r.itcAvailable}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {filteredRecords.length > 0 && (
                    <tfoot className="bg-muted/30 border-t-2 border-border">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 font-bold text-xs text-right text-muted-foreground">Total ({filteredRecords.length} records):</td>
                        <td className="px-3 py-2 text-right font-bold">{formatCurrency(filteredRecords.reduce((s, r) => s + r.taxableAmount, 0))}</td>
                        <td className="px-3 py-2 text-right font-bold">{formatCurrency(filteredRecords.reduce((s, r) => s + r.cgst, 0))}</td>
                        <td className="px-3 py-2 text-right font-bold">{formatCurrency(filteredRecords.reduce((s, r) => s + r.sgst, 0))}</td>
                        <td className="px-3 py-2 text-right font-bold">{formatCurrency(filteredRecords.reduce((s, r) => s + r.igst, 0))}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {!selectedImportId && imports.length === 0 && !importsLoading && (
        <div className="bg-card rounded-2xl border border-dashed border-border p-16 text-center">
          <RefreshCw size={32} className="mx-auto mb-4 text-muted-foreground/40" />
          <p className="text-base font-semibold text-muted-foreground mb-2">No GSTR-2B imports yet</p>
          <p className="text-sm text-muted-foreground">Download your GSTR-2B from the GST portal → B2B sheet → Save as CSV → Upload above.</p>
        </div>
      )}
    </div>
  );
}
