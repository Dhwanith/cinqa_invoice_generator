import { type FormEvent, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LoginPageProps {
  isSubmitting: boolean;
  onLogin: (credentials: { email: string; password: string }) => Promise<void>;
}

export default function LoginPage({ isSubmitting, onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await onLogin({ email, password });
      setPassword("");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  const busy = isSubmitting || submitting;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(163,82,50,0.18),_transparent_30%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.45))] px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-md rounded-[28px] border border-border bg-card/95 backdrop-blur shadow-elevated p-7 md:p-8">
        <div className="flex items-center gap-4 mb-8">
          <img src="/cinqa-logo.jpeg" alt="Cinqa" className="w-14 h-14 rounded-2xl object-cover border border-border shadow-soft" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary mb-1">Protected Access</p>
            <h1 className="font-brand text-3xl font-bold tracking-tight">CINQA</h1>
            <p className="text-sm text-muted-foreground">Operator invoice desk</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="operator@cinqa.space"
              required
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </div>
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button
            type="submit"
            className="w-full gradient-warm text-primary-foreground border-0 shadow-soft hover:shadow-elevated"
            disabled={busy}
          >
            <LockKeyhole size={16} />
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
