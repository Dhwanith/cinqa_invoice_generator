import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, FileText, FilePlus, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/clients", icon: Users, label: "Clients" },
  { to: "/invoices", icon: FileText, label: "Invoices" },
  { to: "/invoices/new", icon: FilePlus, label: "New Invoice" },
];

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
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-[260px] border-r border-border bg-sidebar p-6 sticky top-0 h-screen">
        <div className="flex items-center gap-3 mb-10">
          <img src="/cinqa-logo.jpeg" alt="Cinqa" className="w-11 h-11 rounded-xl object-cover border border-border" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Operations</p>
            <h1 className="font-brand text-2xl font-bold leading-none tracking-tight text-foreground">CINQA</h1>
          </div>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <footer className="pt-6 border-t border-border mt-auto">
          <div className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Signed In</p>
            <p className="text-sm font-semibold text-foreground mt-1">{username}</p>
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
          <nav className="absolute top-16 left-4 right-4 bg-card rounded-2xl shadow-elevated p-4 flex flex-col gap-1 border border-border" onClick={(e) => e.stopPropagation()}>
            {navItems.map((item) => {
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              );
            })}
            <Button
              variant="outline"
              className="mt-3 justify-start rounded-xl"
              onClick={() => {
                setMobileOpen(false);
                onLogout();
              }}
              disabled={isLoggingOut}
            >
              <LogOut size={16} /> {isLoggingOut ? "Signing out..." : "Sign out"}
            </Button>
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
