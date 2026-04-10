import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, FileText, FilePlus, AlertTriangle, CheckCircle2, ArrowRight, CalendarRange } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { fetchClients, fetchInvoices, formatCurrency, formatDate } from "@/services/api";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4, ease: "easeOut" as const } }),
};

type DashboardFilterMode = "overall" | "fy" | "monthly" | "quarterly" | "date-range";

function isTaxInvoice(invoice: { invoiceType?: "tax" | "proforma" }) {
  return (invoice.invoiceType ?? "tax") === "tax";
}

function getDateValue(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getFinancialYearLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

function getFinancialQuarter(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Q1";
  }

  const month = date.getUTCMonth();
  if (month >= 3 && month <= 5) return "Q1";
  if (month >= 6 && month <= 8) return "Q2";
  if (month >= 9 && month <= 11) return "Q3";
  return "Q4";
}

function getMonthValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getDefaultFromDate(invoices: Array<{ invoiceDate: string }>) {
  const sorted = [...invoices].sort((left, right) => getDateValue(right.invoiceDate) - getDateValue(left.invoiceDate));
  return sorted[0]?.invoiceDate?.slice(0, 10) || new Date().toISOString().slice(0, 10);
}

export default function Dashboard() {
  const [filterMode, setFilterMode] = useState<DashboardFilterMode>("overall");
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["clients", "dashboard"],
    queryFn: () => fetchClients({ active: "all" }),
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["invoices", "dashboard"],
    queryFn: () => fetchInvoices({ status: "all" }),
  });

  const fyOptions = useMemo(
    () => [...new Set(invoices.map((invoice) => getFinancialYearLabel(invoice.invoiceDate)).filter((value) => value !== "Unknown"))].sort().reverse(),
    [invoices]
  );
  const monthOptions = useMemo(
    () => [...new Set(invoices.map((invoice) => getMonthValue(invoice.invoiceDate)).filter(Boolean))].sort().reverse(),
    [invoices]
  );
  const [selectedFy, setSelectedFy] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedQuarterFy, setSelectedQuarterFy] = useState<string>("");
  const [selectedQuarter, setSelectedQuarter] = useState<string>("Q1");
  const [rangeStart, setRangeStart] = useState<string>("");
  const [rangeEnd, setRangeEnd] = useState<string>("");

  const effectiveFy = selectedFy || fyOptions[0] || "";
  const effectiveMonth = selectedMonth || monthOptions[0] || "";
  const effectiveQuarterFy = selectedQuarterFy || fyOptions[0] || "";
  const effectiveRangeStart = rangeStart || getDefaultFromDate(invoices);
  const effectiveRangeEnd = rangeEnd || new Date().toISOString().slice(0, 10);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const invoiceDate = invoice.invoiceDate?.slice(0, 10);

      switch (filterMode) {
        case "fy":
          return getFinancialYearLabel(invoice.invoiceDate) === effectiveFy;
        case "monthly":
          return getMonthValue(invoice.invoiceDate) === effectiveMonth;
        case "quarterly":
          return getFinancialYearLabel(invoice.invoiceDate) === effectiveQuarterFy && getFinancialQuarter(invoice.invoiceDate) === selectedQuarter;
        case "date-range":
          return invoiceDate >= effectiveRangeStart && invoiceDate <= effectiveRangeEnd;
        case "overall":
        default:
          return true;
      }
    });
  }, [invoices, filterMode, effectiveFy, effectiveMonth, effectiveQuarterFy, selectedQuarter, effectiveRangeStart, effectiveRangeEnd]);

  const recentInvoices = useMemo(
    () => [...filteredInvoices].sort((left, right) => getDateValue(right.invoiceDate) - getDateValue(left.invoiceDate)).slice(0, 5),
    [filteredInvoices]
  );
  const isLoading = clientsLoading || invoicesLoading;

  const activeClients = clients.filter((c) => c.active).length;
  const totalRevenue = filteredInvoices.filter(isTaxInvoice).reduce((s, i) => s + i.total, 0);
  const paidInvoices = filteredInvoices.filter((i) => i.status === "paid").length;
  const pendingInvoices = filteredInvoices.filter((i) => i.status !== "paid").length;

  const stats = [
    { label: "Active Clients", value: activeClients, icon: Users, color: "text-primary" },
    { label: "Total Invoiced", value: formatCurrency(totalRevenue), icon: FileText, color: "text-foreground" },
    { label: "Paid", value: paidInvoices, icon: CheckCircle2, color: "text-success" },
    { label: "Pending", value: pendingInvoices, icon: AlertTriangle, color: "text-primary" },
  ];

  return (
    <div>
      <PageHeader
        kicker="Internal Ops Desk"
        title="Invoice Desk"
        description="Register clients, generate invoices, and manage your billing — all in one place."
        action={
          <Link to="/invoices/new" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-warm text-primary-foreground font-semibold text-sm shadow-soft hover:shadow-elevated transition-all duration-200 hover:-translate-y-0.5">
            <FilePlus size={16} /> New Invoice
          </Link>
        }
      />

      <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp} className="bg-card rounded-2xl border border-border shadow-soft p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarRange size={16} className="text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">Dashboard Filters</h3>
        </div>
        <div className="grid md:grid-cols-[180px,1fr] gap-4 items-start">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">View</label>
            <select
              value={filterMode}
              onChange={(event) => setFilterMode(event.target.value as DashboardFilterMode)}
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="overall">Overall</option>
              <option value="fy">Financial Year</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="date-range">Date Range</option>
            </select>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filterMode === "fy" && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Financial Year</label>
                <select
                  value={effectiveFy}
                  onChange={(event) => setSelectedFy(event.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {fyOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            )}

            {filterMode === "monthly" && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Month</label>
                <select
                  value={effectiveMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {monthOptions.map((option) => (
                    <option key={option} value={option}>{new Date(`${option}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</option>
                  ))}
                </select>
              </div>
            )}

            {filterMode === "quarterly" && (
              <>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Financial Year</label>
                  <select
                    value={effectiveQuarterFy}
                    onChange={(event) => setSelectedQuarterFy(event.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {fyOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Quarter</label>
                  <select
                    value={selectedQuarter}
                    onChange={(event) => setSelectedQuarter(event.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="Q1">Q1 (Apr-Jun)</option>
                    <option value="Q2">Q2 (Jul-Sep)</option>
                    <option value="Q3">Q3 (Oct-Dec)</option>
                    <option value="Q4">Q4 (Jan-Mar)</option>
                  </select>
                </div>
              </>
            )}

            {filterMode === "date-range" && (
              <>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">From</label>
                  <input
                    type="date"
                    value={effectiveRangeStart}
                    onChange={(event) => setRangeStart(event.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">To</label>
                  <input
                    type="date"
                    value={effectiveRangeEnd}
                    onChange={(event) => setRangeEnd(event.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </>
            )}

            {filterMode === "overall" && (
              <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                Showing all invoices across the full available period.
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} custom={i} initial="hidden" animate="show" variants={fadeUp} className="bg-card rounded-2xl p-5 border border-border shadow-soft">
            <div className="flex items-center gap-2 mb-3">
              <stat.icon size={16} className={stat.color} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <motion.div custom={4} initial="hidden" animate="show" variants={fadeUp} className="bg-card rounded-2xl border border-border shadow-soft">
          <div className="flex items-center justify-between p-5 pb-3">
            <h3 className="text-lg font-bold">Recent Invoices</h3>
            <Link to="/invoices" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {!recentInvoices.length && <div className="px-5 py-6 text-sm text-muted-foreground">No invoices found for the selected filter.</div>}
            {recentInvoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-semibold">{inv.invoiceNo}</p>
                  <p className="text-xs text-muted-foreground">{inv.clientName} · {formatDate(inv.invoiceDate)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{formatCurrency(inv.total)}</span>
                  <StatusBadge status={inv.status || "generated"} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Clients */}
        <motion.div custom={5} initial="hidden" animate="show" variants={fadeUp} className="bg-card rounded-2xl border border-border shadow-soft">
          <div className="flex items-center justify-between p-5 pb-3">
            <h3 className="text-lg font-bold">Clients</h3>
            <Link to="/clients" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              Manage <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {clients.map((client) => (
              <div key={client.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-semibold">{client.name}</p>
                  <p className="text-xs text-muted-foreground">{client.gstin} · {client.state}</p>
                </div>
                <StatusBadge status={client.active ? "active" : "inactive"} />
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground mt-6">Loading live data…</p>}
    </div>
  );
}
