import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, FileText, FilePlus, LogOut, Menu, X,
  Receipt, Building2, ShoppingBag, Wallet, FileSpreadsheet, Calculator, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navGroups = [
  {
    label: null,
    items: [{ to: "/", icon: LayoutDashboard, label: "Dashboard" }],
  },
  {
    label: "Sales",
    items: [
      { to: "/invoices",     icon: FileText,       label: "Invoices" },
      { to: "/invoices/new", icon: FilePlus,        label: "New Invoice" },
      { to: "/clients",      icon: Users,           label: "Clients" },
    ],
  },
  {
    label: "Purchases",
    items: [
      { to: "/purchases",     icon: Receipt,    label: "Purchase Register" },
      { to: "/purchases/new", icon: ShoppingBag, label: "New Purchase" },
      { to: "/vendors",       icon: Building2,  label: "Vendors" },
    ],
  },
  {
    label: "Expenses",
    items: [
      { to: "/reimbursements", icon: Wallet, label: "Reimbursements" },
    ],
  },
  {
    label: "GST",
    items: [
      { to: "/gst/gstr3b",  icon: Calculator,      label: "GSTR-3B Filing" },
      { to: "/gst/gstr2b",  icon: FileSpreadsheet, label: "GSTR-2B Recon" },
      { to: "/gst/summary", icon: BarChart3,        label: "GST Summary" },
    ],
  },
];

function NavItem({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  const location = useLocation();
  const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to) && (to !== "/invoices" || !location.pathname.startsWith("/invoices/new")) && (to !== "/purchases" || !location.pathname.startsWith("/purchases/new"));
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
          : "text-sidebar-foreground hover:bg-sidebar-accent/50"
      }`}
    >
      <Icon size={16} />
      {label}
    </Link>
  );
}

export default function AppLayout({
  children,
  username,
  onLogout,
  isLoggingOut,
}: {
  children: React.ReactNode;
  username: string;
  onLogout: () => void;
  isLoggingOut?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = (onItemClick?: () => void) => (
    <>
      {navGroups.map((group, gi) => (
        <div key={gi} className={gi > 0 ? "mt-4" : ""}>
          {group.label && (
            <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
              {group.label}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <div key={item.to} onClick={onItemClick}>
                <NavItem to={item.to} icon={item.icon} label={item.label} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-[260px] border-r border-border bg-sidebar p-5 sticky top-0 h-screen overflow-y-auto">
        <div className="flex items-center gap-3 mb-8">
          <img src="/cinqa-logo.jpeg" alt="Cinqa" className="w-11 h-11 rounded-xl object-cover border border-border" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Operations</p>
            <h1 className="font-brand text-2xl font-bold leading-none tracking-tight text-foreground">CINQA</h1>
          </div>
        </div>

        <nav className="flex flex-col flex-1 gap-0">
          {navContent()}
        </nav>

        <footer className="pt-5 border-t border-border mt-4">
          <div className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Signed In</p>
            <p className="text-sm font-semibold text-foreground mt-0.5 truncate">{username}</p>
          </div>
          <Button variant="outline" className="w-full justify-start rounded-xl mb-4" onClick={onLogout} disabled={isLoggingOut}>
            <LogOut size={16} /> {isLoggingOut ? "Signing out..." : "Sign out"}
          </Button>
          <p className="font-brand text-lg font-bold text-foreground tracking-tight">CINQA</p>
          <a href="https://www.cinqa.space" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary transition-colors">
            www.cinqa.space
          </a>
        </footer>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-sidebar/95 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-3">
          <img src="/cinqa-logo.jpeg" alt="Cinqa" className="w-9 h-9 rounded-lg object-cover border border-border" />
          <h1 className="font-brand text-xl font-bold tracking-tight text-foreground">CINQA</h1>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 rounded-xl bg-accent text-accent-foreground">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)}>
          <nav
            className="absolute top-16 left-4 right-4 bg-card rounded-2xl shadow-elevated p-4 border border-border max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {navContent(() => setMobileOpen(false))}
            <div className="mt-4 pt-4 border-t border-border">
              <Button variant="outline" className="w-full justify-start rounded-xl" onClick={() => { setMobileOpen(false); onLogout(); }} disabled={isLoggingOut}>
                <LogOut size={16} /> {isLoggingOut ? "Signing out..." : "Sign out"}
              </Button>
            </div>
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 lg:p-8 p-4 pt-20 lg:pt-8 overflow-auto">
        <div className="max-w-[1200px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
