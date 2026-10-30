import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const search = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Sign in — OpenCharterApp" },
      { name: "description", content: "Sign in to manage your association, chapters and members." },
      { property: "og:title", content: "Sign in — OpenCharterApp" },
      { property: "og:description", content: "Sign in to manage your association, chapters and members." },
    ],
  }),
  component: AuthPage,
});

const creds = z.object({ email: z.string().trim().email(), password: z.string().min(8, "At least 8 characters") });

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        // R-15: same message whether or not the account exists
        setNotice("If an account exists for that email, a reset link is on its way.");
        return;
      }
      const parsed = creds.safeParse({ email, password });
      if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message);
      if (mode === "up") {
        await supabase.auth.signUp({ ...parsed.data, options: { emailRedirectTo: window.location.origin + "/dashboard" } });
        setNotice("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) return void toast.error("Email or password is incorrect.");
        navigate({ to: "/dashboard" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) return void toast.error("Google sign-in failed");
    if (!r.redirected) navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rule-brass bg-card p-8 shadow-sm">
        <Link to="/" className="font-display text-xl font-semibold text-primary">OpenCharter</Link>
        <h1 className="mt-4 text-2xl font-semibold">
          {mode === "in" ? "Sign in" : mode === "up" ? "Create your account" : "Reset password"}
        </h1>
        {notice ? (
          <p className="mt-6 text-sm text-muted-foreground">{notice}</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}
            </Button>
            {mode !== "forgot" && (
              <Button type="button" variant="outline" className="w-full" onClick={google}>
                Continue with Google
              </Button>
            )}
          </form>
        )}
        <div className="mt-6 flex justify-between text-sm">
          <button className="text-primary hover:underline" onClick={() => { setNotice(null); setMode(mode === "in" ? "up" : "in"); }}>
            {mode === "in" ? "Create an account" : "Back to sign in"}
          </button>
          {mode === "in" && (
            <button className="text-muted-foreground hover:underline" onClick={() => setMode("forgot")}>Forgot password?</button>
          )}
        </div>
      </div>
    </div>
  );
}
