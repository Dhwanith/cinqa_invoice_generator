import { type FormEvent, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LoginPageProps {
  configured: boolean;
  isSubmitting: boolean;
  onLogin: (credentials: { username: string; password: string }) => Promise<void>;
}

export default function LoginPage({ configured, isSubmitting, onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    try {
      await onLogin({ username, password });
      setPassword("");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    }
  };

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

        {!configured ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm text-destructive">
            App authentication is not configured yet. Set <strong>APP_AUTH_USERNAME</strong>, <strong>APP_AUTH_PASSWORD</strong>, and <strong>APP_SESSION_SECRET</strong> on the server before signing in.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Username</label>
              <Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Password</label>
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </div>
            {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}
            <Button type="submit" className="w-full gradient-warm text-primary-foreground border-0 shadow-soft hover:shadow-elevated" disabled={isSubmitting}>
              <LockKeyhole size={16} /> {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
