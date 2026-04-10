import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import LoginPage from "@/pages/LoginPage";
import NotFound from "@/pages/NotFound";
import { fetchAuthSession, loginApp, logoutApp } from "@/services/api";

const queryClient = new QueryClient();

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
    const intervalId = window.setInterval(() => {
      setQuoteIndex((current) => (current + 1) % sessionLoadingQuotes.length);
    }, 1800);

    return () => window.clearInterval(intervalId);
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
        <p className="text-sm text-muted-foreground min-h-[20px] transition-all duration-300">{sessionLoadingQuotes[quoteIndex]}</p>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const queryClient = useQueryClient();
  const authSessionQuery = useQuery({
    queryKey: ["auth", "session"],
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 60_000,
  });

  const loginMutation = useMutation({
    mutationFn: loginApp,
    onSuccess: (session) => {
      queryClient.setQueryData(["auth", "session"], session);
      toast.success(`Signed in as ${session.username}.`);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logoutApp,
    onSuccess: (session) => {
      queryClient.setQueryData(["auth", "session"], session);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
      toast.success("Signed out.");
    },
  });

  useEffect(() => {
    const handleAuthExpired = () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
      toast.error("Your session expired. Please sign in again.");
    };

    window.addEventListener("app-auth-expired", handleAuthExpired);
    return () => window.removeEventListener("app-auth-expired", handleAuthExpired);
  }, [queryClient]);

  if (authSessionQuery.isLoading) {
    return <SessionLoadingScreen />;
  }

  if (!authSessionQuery.data?.authenticated) {
    return (
      <LoginPage
        configured={Boolean(authSessionQuery.data?.configured)}
        isSubmitting={loginMutation.isPending}
        onLogin={async (credentials) => {
          await loginMutation.mutateAsync(credentials);
        }}
      />
    );
  }

  return (
    <AppLayout
      username={authSessionQuery.data.username}
      onLogout={() => logoutMutation.mutate()}
      isLoggingOut={logoutMutation.isPending}
    >
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/new" element={<CreateInvoicePage />} />
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
