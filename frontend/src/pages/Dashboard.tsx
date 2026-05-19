import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle, ArrowRight, BarChart3, Building2, CheckCircle2,
  CreditCard, FileText, FilePlus, IndianRupee, Receipt, ShoppingBag,
  TrendingDown, TrendingUp, Users, Wallet,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/services/api";
import { fetchDashboard } from "@/services/dashboard-api";

const fadeUp = { hidden: { opacity: 0, y: 12 }, show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.35, ease: "easeOut" as const } }) };

function KpiCard({ label, value, sub, icon: Icon, trend, color, to, index }: { label: string; value: string; sub?: string; icon: React.ElementType; trend?: 'up' | 'down' | 'neutral'; color?: string; to?: string; index: number }) {
  const card = (
    <motion.div custom={index} initial="hidden" animate="show" variants={fadeUp}
      className={`bg-card rounded-2xl border border-border p-5 shadow-soft ${to ? 'hover:shadow-elevated hover:-translate-y-0.5 transition-all cursor-pointer' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color || 'bg-primary/10'}`}>
          <Icon size={15} className={color ? 'text-white' : 'text-primary'} />
        </div>
      </div>
      <p className="text-2xl font-black tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </motion.div>
  );
  return to ? <Link to={to}>{card}</Link> : card;
}

function AlertCard({ icon: Icon, message, sub, to, color }: { icon: React.ElementType; message: string; sub?: string; to: string; color: string }) {
  return (
    <Link to={to} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${color} hover:shadow-soft transition-all`}>
      <Icon size={16} className="shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{message}</p>
        {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
      </div>
      <ArrowRight size={14} className="shrink-0 mt-0.5 opacity-50" />
    </Link>
  );
}

type PeriodMode = 'mtd' | 'ytd' | 'fy';

export default function Dashboard() {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('ytd');

  const periodParams = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1;
    const today = now.toISOString().slice(0, 10);
    const fyStart = m >= 4 ? y : y - 1;
    switch (periodMode) {
      case 'mtd': return { dateFrom: `${y}-${String(m).padStart(2, '0')}-01`, dateTo: today };
      case 'ytd': return { dateFrom: `${fyStart}-04-01`, dateTo: today };
      case 'fy':  return { dateFrom: `${fyStart}-04-01`, dateTo: `${fyStart + 1}-03-31` };
    }
  }, [periodMode]);

  const { data: summary, isLoading } = useQuery({
    queryKey: ['dashboard', periodParams.dateFrom, periodParams.dateTo],
    queryFn: () => fetchDashboard(periodParams),
    staleTime: 60_000,
  });

  const s = summary;

  const alerts = useMemo(() => {
    if (!s) return [];
    const list = [];
    if (s.counts.unpaidInvoices > 0) list.push({ key: 'ar', icon: FileText, message: `${s.counts.unpaidInvoices} invoice${s.counts.unpaidInvoices > 1 ? 's' : ''} awaiting payment`, sub: formatCurrency(s.outstandingAR), to: '/invoices', color: 'bg-amber-500/8 border-amber-500/30 text-amber-700' });
    if (s.counts.pendingReimbs > 0) list.push({ key: 'reimb', icon: Wallet, message: `${s.counts.pendingReimbs} reimbursement${s.counts.pendingReimbs > 1 ? 's' : ''} pending approval`, sub: formatCurrency(s.pendingReimbursements), to: '/reimbursements', color: 'bg-primary/8 border-primary/30 text-primary' });
    if (s.counts.unpaidPurchases > 0) list.push({ key: 'ap', icon: Receipt, message: `${s.counts.unpaidPurchases} purchase${s.counts.unpaidPurchases > 1 ? 's' : ''} unpaid`, sub: formatCurrency(s.outstandingAP), to: '/purchases', color: 'bg-blue-500/8 border-blue-500/30 text-blue-700' });
    if (s.latestGstr3b && s.latestGstr3b.status !== 'filed') list.push({ key: 'gst', icon: AlertTriangle, message: `GSTR-3B for ${s.latestGstr3b.periodLabel} not yet filed`, sub: s.gstPayable !== null ? `Net payable: ${formatCurrency(s.gstPayable)}` : undefined, to: '/gst/gstr3b', color: 'bg-destructive/8 border-destructive/30 text-destructive' });
    return list;
  }, [s]);

  const quickActions = [
    { label: 'New Invoice',       icon: FilePlus,    to: '/invoices/new',      color: 'gradient-warm' },
    { label: 'New Purchase',      icon: ShoppingBag, to: '/purchases/new',     color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Reimbursement',     icon: Wallet,      to: '/reimbursements',    color: 'bg-amber-600 hover:bg-amber-700' },
    { label: 'Payroll Register',  icon: CreditCard,  to: '/payroll/register',  color: 'bg-purple-600 hover:bg-purple-700' },
    { label: 'GSTR-3B',          icon: BarChart3,   to: '/gst/gstr3b',        color: 'bg-emerald-600 hover:bg-emerald-700' },
  ];

  return (
    <div>
      <PageHeader
        kicker="Internal Ops Desk"
        title="Dashboard"
        description="Financial command centre — revenue, expenses, outstanding amounts, and action items at a glance."
        action={
          <div className="flex gap-1.5 bg-muted rounded-xl p-1">
            {(['mtd', 'ytd', 'fy'] as PeriodMode[]).map((mode) => (
              <button key={mode} onClick={() => setPeriodMode(mode)} className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all ${periodMode === mode ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {mode === 'mtd' ? 'Month' : mode === 'ytd' ? 'FY YTD' : 'Full FY'}
              </button>
            ))}
          </div>
        }
      />

      {/* Financial KPIs — Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard index={0} label="Revenue" icon={TrendingUp} value={isLoading ? '…' : formatCurrency(s?.revenue || 0)} sub={`${s?.counts.invoiceCount || 0} invoices`} color="bg-success" to="/invoices" />
        <KpiCard index={1} label="Expenses" icon={TrendingDown} value={isLoading ? '…' : formatCurrency(s?.totalExpenses || 0)} sub={`Purchases + Reimbursements`} color="bg-primary" to="/purchases" />
        <KpiCard index={2} label="Net Profit" icon={IndianRupee} value={isLoading ? '…' : formatCurrency(s?.netProfit || 0)} sub={s ? (s.netProfit >= 0 ? 'Profitable period' : 'Loss period') : ''} />
        <KpiCard index={3} label="Bank Balance" icon={Building2} value={isLoading ? '…' : s?.bankBalance !== null && s?.bankBalance !== undefined ? formatCurrency(s.bankBalance) : 'Not set'} sub={s?.bankDate ? `as of ${formatDate(s.bankDate)}` : 'Click to update'} to="/accounting/balance-sheet" />
      </div>

      {/* Balance Sheet KPIs — Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard index={4} label="Accounts Receivable" icon={FileText} value={isLoading ? '…' : formatCurrency(s?.outstandingAR || 0)} sub={`${s?.counts.unpaidInvoices || 0} unpaid invoices`} to="/invoices" />
        <KpiCard index={5} label="Accounts Payable" icon={Receipt} value={isLoading ? '…' : formatCurrency(s?.outstandingAP || 0)} sub={`${s?.counts.unpaidPurchases || 0} unpaid purchases`} to="/purchases" />
        <KpiCard index={6} label="ITC Balance" icon={BarChart3} value={isLoading ? '…' : formatCurrency(s?.itcBalance || 0)} sub="Claimable input tax credit" to="/gst/gstr3b" />
        <KpiCard index={7} label="GST Payable" icon={AlertTriangle} value={isLoading ? '…' : s?.gstPayable !== null && s?.gstPayable !== undefined ? formatCurrency(s.gstPayable) : 'Not computed'} sub={s?.latestGstr3b?.periodLabel ? `${s.latestGstr3b.periodLabel} · ${s.latestGstr3b.status}` : 'Compute GSTR-3B'} to="/gst/gstr3b" />
      </div>

      <div className="grid lg:grid-cols-[1fr,340px] gap-6">
        <div className="space-y-6">

          {/* Action Required */}
          {alerts.length > 0 && (
            <motion.div custom={8} initial="hidden" animate="show" variants={fadeUp} className="bg-card rounded-2xl border border-border shadow-soft p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={15} className="text-amber-600" />
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">Action Required</h3>
              </div>
              <div className="space-y-2">
                {alerts.map((alert) => <AlertCard key={alert.key} {...alert} />)}
                {alerts.length === 0 && <p className="text-sm text-muted-foreground">All clear — no pending actions.</p>}
              </div>
            </motion.div>
          )}

          {/* Recent Invoices */}
          <motion.div custom={9} initial="hidden" animate="show" variants={fadeUp} className="bg-card rounded-2xl border border-border shadow-soft">
            <div className="flex items-center justify-between p-5 pb-3">
              <div className="flex items-center gap-2"><FileText size={15} className="text-primary" /><h3 className="text-sm font-bold">Recent Invoices</h3></div>
              <Link to="/invoices" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">View all <ArrowRight size={11} /></Link>
            </div>
            <div className="divide-y divide-border">
              {isLoading && <div className="px-5 py-4 text-sm text-muted-foreground">Loading…</div>}
              {!isLoading && (s?.recent.invoices || []).length === 0 && <div className="px-5 py-4 text-sm text-muted-foreground">No recent invoices.</div>}
              {(s?.recent.invoices || []).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-semibold">{inv.invoiceNo}</p>
                    <p className="text-xs text-muted-foreground">{inv.clientName} · {formatDate(inv.invoiceDate)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">{formatCurrency(inv.total)}</span>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Recent Purchases */}
          <motion.div custom={10} initial="hidden" animate="show" variants={fadeUp} className="bg-card rounded-2xl border border-border shadow-soft">
            <div className="flex items-center justify-between p-5 pb-3">
              <div className="flex items-center gap-2"><Receipt size={15} className="text-blue-600" /><h3 className="text-sm font-bold">Recent Purchases</h3></div>
              <Link to="/purchases" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">View all <ArrowRight size={11} /></Link>
            </div>
            <div className="divide-y divide-border">
              {!isLoading && (s?.recent.purchases || []).length === 0 && <div className="px-5 py-4 text-sm text-muted-foreground">No recent purchases.</div>}
              {(s?.recent.purchases || []).map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-semibold">{p.vendorName}</p>
                    <p className="text-xs text-muted-foreground">{p.purchaseNumber || p.category} · {formatDate(p.purchaseDate)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">{formatCurrency(p.total)}</span>
                    <StatusBadge status={p.status} />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Quick Actions */}
          <motion.div custom={8} initial="hidden" animate="show" variants={fadeUp} className="bg-card rounded-2xl border border-border shadow-soft p-5">
            <h3 className="text-sm font-bold mb-4">Quick Actions</h3>
            <div className="space-y-2">
              {quickActions.map(({ label, icon: Icon, to, color }) => (
                <Link key={to} to={to} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-soft ${color}`}>
                  <Icon size={15} />{label}
                </Link>
              ))}
            </div>
          </motion.div>

          {/* Pending Reimbursements */}
          {(s?.recent.pendingReimbs || []).length > 0 && (
            <motion.div custom={11} initial="hidden" animate="show" variants={fadeUp} className="bg-card rounded-2xl border border-border shadow-soft">
              <div className="flex items-center justify-between p-4 pb-2">
                <div className="flex items-center gap-2"><Wallet size={14} className="text-primary" /><p className="text-sm font-bold">Pending Reimbursements</p></div>
                <Link to="/reimbursements" className="text-xs font-semibold text-primary hover:underline">Approve all</Link>
              </div>
              <div className="divide-y divide-border">
                {(s?.recent.pendingReimbs || []).map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">{r.paidBy}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{r.description}</p>
                    </div>
                    <span className="text-sm font-bold ml-3">{formatCurrency(r.amount)}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Module summary */}
          <motion.div custom={12} initial="hidden" animate="show" variants={fadeUp} className="bg-card rounded-2xl border border-border shadow-soft p-5">
            <h3 className="text-sm font-bold mb-4">Platform</h3>
            <div className="space-y-3">
              {[
                { icon: Users, label: 'Active Employees', value: s?.counts.activeEmployees || 0, to: '/payroll/employees' },
                { icon: FileText, label: 'Invoices (period)', value: s?.counts.invoiceCount || 0, to: '/invoices' },
                { icon: Receipt, label: 'Unpaid Purchases', value: s?.counts.unpaidPurchases || 0, to: '/purchases' },
              ].map(({ icon: Icon, label, value, to }) => (
                <Link key={to} to={to} className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center"><Icon size={13} className="text-muted-foreground" /></div>
                    <span className="text-sm text-muted-foreground">{label}</span>
                  </div>
                  <span className="text-sm font-bold">{value}</span>
                </Link>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
