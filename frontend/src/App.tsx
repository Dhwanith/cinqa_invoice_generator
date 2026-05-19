import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import ClientsPage from "@/pages/ClientsPage";
import InvoicesPage from "@/pages/InvoicesPage";
import CreateInvoicePage from "@/pages/CreateInvoicePage";
import VendorsPage from "@/pages/VendorsPage";
import PurchasesPage from "@/pages/PurchasesPage";
import CreatePurchasePage from "@/pages/CreatePurchasePage";
import ReimbursementsPage from "@/pages/ReimbursementsPage";
import EmployeesPage from "@/pages/payroll/EmployeesPage";
import PayrollRegisterPage from "@/pages/payroll/PayrollRegisterPage";
import ProfitLossPage from "@/pages/accounting/ProfitLossPage";
import BalanceSheetPage from "@/pages/accounting/BalanceSheetPage";
import TrialBalancePage from "@/pages/accounting/TrialBalancePage";
import JournalPage from "@/pages/accounting/JournalPage";
import Gstr2bPage from "@/pages/gst/Gstr2bPage";
import Gstr3bPage from "@/pages/gst/Gstr3bPage";
import GstSummaryPage from "@/pages/gst/GstSummaryPage";
import LoginPage from "@/pages/LoginPage";
import NotFound from "@/pages/NotFound";
import { getSupabase } from "@/lib/supabase";

const queryClient = new QueryClient();

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  email: string;
}

const sessionLoadingQuotes = [
  "Aligning ledgers and planets.",
  "Convincing invoices to behave professionally.",
  "Teaching the desk who is actually in charge.",
  "Polishing numbers before they see daylight.",
  "Checking locks, seals, and billing vibes.",
];

function SessionLoadingScreen() {
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(
      () => setQuoteIndex((i) => (i + 1) % sessionLoadingQuotes.length),
      1800
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(163,82,50,0.16),_transparent_28%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.45))] px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-md rounded-[28px] border border-border bg-card/95 backdrop-blur shadow-elevated p-8 text-center">
        <div className="mx-auto mb-6 relative h-16 w-16">
          <div className="absolute inset-0 rounded-full border-4 border-primary/15" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary border-r-primary animate-spin" />
          <div className="absolute inset-[14px] rounded-full bg-primary/10" />
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary mb-2">Secure Access</p>
        <h1 className="font-brand text-3xl font-bold tracking-tight mb-3">Checking Session</h1>
        <p className="text-sm text-muted-foreground min-h-[20px] transition-all duration-300">
          {sessionLoadingQuotes[quoteIndex]}
        </p>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const qc = useQueryClient();
  const [auth, setAuth] = useState<AuthState>({ loading: true, authenticated: false, email: "" });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    getSupabase()
      .then((supabase) => {
        if (cancelled) return;

        // Resolve current session immediately (avoids a flash of login screen)
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (cancelled) return;
          setAuth({ loading: false, authenticated: Boolean(session), email: session?.user?.email ?? "" });
        });

        // Keep auth state in sync with Supabase session lifecycle
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          setAuth({ loading: false, authenticated: Boolean(session), email: session?.user?.email ?? "" });
          if (!session) {
            qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
          }
        });

        subRef.current = subscription;
      })
      .catch(() => {
        if (!cancelled) {
          setAuth({ loading: false, authenticated: false, email: "" });
        }
      });

    return () => {
      cancelled = true;
      subRef.current?.unsubscribe();
    };
  }, [qc]);

  // Re-check session when the auth-expired event fires (e.g. 401 from API)
  useEffect(() => {
    const handler = async () => {
      const supabase = await getSupabase();
      await supabase.auth.refreshSession();
    };
    window.addEventListener("app-auth-expired", handler);
    return () => window.removeEventListener("app-auth-expired", handler);
  }, []);

  const handleLogin = async (credentials: { email: string; password: string }) => {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) throw new Error(error.message);
    toast.success("Signed in successfully.");
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = await getSupabase();
      await supabase.auth.signOut();
      toast.success("Signed out.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (auth.loading) return <SessionLoadingScreen />;

  if (!auth.authenticated) {
    return <LoginPage isSubmitting={false} onLogin={handleLogin} />;
  }

  return (
    <AppLayout username={auth.email} onLogout={handleLogout} isLoggingOut={isLoggingOut}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/new" element={<CreateInvoicePage />} />
        <Route path="/vendors" element={<VendorsPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/purchases/new" element={<CreatePurchasePage />} />
        <Route path="/reimbursements" element={<ReimbursementsPage />} />
        <Route path="/payroll/employees" element={<EmployeesPage />} />
        <Route path="/payroll/register"   element={<PayrollRegisterPage />} />
        <Route path="/accounting/profit-loss"  element={<ProfitLossPage />} />
        <Route path="/accounting/balance-sheet" element={<BalanceSheetPage />} />
        <Route path="/accounting/trial-balance" element={<TrialBalancePage />} />
        <Route path="/accounting/journals"      element={<JournalPage />} />
        <Route path="/gst/gstr2b" element={<Gstr2bPage />} />
        <Route path="/gst/gstr3b" element={<Gstr3bPage />} />
        <Route path="/gst/summary" element={<GstSummaryPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthenticatedApp />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
