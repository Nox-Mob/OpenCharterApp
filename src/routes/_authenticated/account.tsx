import { useEffect, useState } from "react";
import { hubUrl, isHosted } from "@shared/supabase/hosted";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { myOrgsQuery, TYPE_LABEL } from "@/lib/orgs";
import { useFeatureReady } from "@/lib/db/readiness";
import {
  accountErrorMessage,
  changeMyEmail,
  changeMyPassword,
  emailSchema,
  nameSchema,
  passwordSchema,
  saveMyName,
  syncMyEmail,
} from "@/modules/account";
import { defaultOrgIdOf, saveDefaultOrg } from "@/modules/account/landing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "Your account — OpenCharterApp" }] }),
  component: AccountPage,
});

type Me = {
  id: string;
  email: string;
  name: string;
  provider: string;
  pendingEmail: string;
  defaultOrgId: string | null;
};

const meQuery = {
  queryKey: ["me-account"],
  queryFn: async (): Promise<Me | null> => {
    const { data } = await supabase.auth.getUser();
    const u = data.user;
    if (!u) return null;
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const { data: profiles } = await supabase
      .from("member_profiles")
      .select("display_name")
      .eq("user_id", u.id)
      .limit(1);
    return {
      id: u.id,
      email: u.email ?? "",
      name:
        String(meta["full_name"] ?? meta["name"] ?? "").trim() ||
        (profiles?.[0]?.display_name ?? ""),
      provider: String((u.app_metadata as Record<string, unknown>)?.["provider"] ?? "email"),
      pendingEmail: (u as { new_email?: string }).new_email ?? "",
      defaultOrgId: defaultOrgIdOf(u),
    };
  },
};

/** Your account (U4, D-192): name, sign-in email, password and your organizations. */
function AccountPage() {
  const me = useQuery(meQuery);
  const orgs = useQuery(myOrgsQuery());
  const syncReady = useFeatureReady("email_sync") === true;
  const qc = useQueryClient();

  // after a new email is confirmed, the member records follow it
  useEffect(() => {
    if (!syncReady || !me.data) return;
    void syncMyEmail()
      .then((n) => {
        if (n > 0) qc.invalidateQueries({ queryKey: ["members"] });
      })
      .catch(() => {});
  }, [syncReady, me.data, qc]);

  if (me.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!me.data) return <p className="text-muted-foreground">Sign in to see your account.</p>;
  const m = me.data;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-3xl font-semibold">Your account</h1>
      {isHosted() ? (
        // Hosted: name, email, password and deleting the account are OpenAppHub's (one
        // account for every app).
        <section className="space-y-2 rounded-md border bg-card p-5 text-sm">
          <h2 className="text-lg font-semibold">Name, email and password</h2>
          <p className="text-muted-foreground">
            Your account covers every OpenAppHub app, so these are changed in OpenAppHub.
          </p>
          <a href={hubUrl("/account")} className="font-medium text-primary hover:underline">
            Account settings
          </a>
        </section>
      ) : (
        <NameCard me={m} />
      )}
      <DefaultOrgCard me={m} orgs={orgs.data ?? []} />
      {isHosted() ? null : <EmailCard me={m} />}
      {isHosted() ? null : m.provider === "email" ? (
        <PasswordCard />
      ) : (
        <section className="rounded-md border bg-card p-5 text-sm text-muted-foreground">
          You sign in with {m.provider === "google" ? "Google" : m.provider}, so there&apos;s no
          password to change here.
        </section>
      )}
      <section className="space-y-3 rounded-md border bg-card p-5">
        <h2 className="text-lg font-semibold">Your organizations</h2>
        {(orgs.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">You don&apos;t belong to any yet.</p>
        ) : (
          <ul className="divide-y">
            {(orgs.data ?? []).map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2">
                <Link to="/orgs/$orgId" params={{ orgId: o.id }} className="hover:underline">
                  {o.name}
                </Link>
                <Badge variant="outline">{TYPE_LABEL[o.type]}</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted-foreground">
          To leave an organization or correct what it records about you, contact its administrators.
        </p>
      </section>
    </div>
  );
}

const NO_DEFAULT = "none";

/** Which organization opens after signing in (D-206). */
function DefaultOrgCard({ me, orgs }: { me: Me; orgs: readonly { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(me.defaultOrgId ?? NO_DEFAULT);
  const [busy, setBusy] = useState(false);
  // a default you no longer belong to reads as "no default"
  const current = orgs.some((o) => o.id === value) ? value : NO_DEFAULT;
  async function choose(next: string) {
    const previous = value;
    setValue(next);
    setBusy(true);
    try {
      await saveDefaultOrg(next === NO_DEFAULT ? null : next);
      toast.success("Default organization saved");
      qc.invalidateQueries({ queryKey: meQuery.queryKey });
    } catch (err) {
      setValue(previous);
      toast.error(accountErrorMessage(String((err as Error).message)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-md border bg-card p-5">
      <h2 className="text-lg font-semibold">Default organization</h2>
      <div className="space-y-1">
        <Label htmlFor="account-default-org">Open after signing in</Label>
        <Select value={current} onValueChange={choose} disabled={busy || orgs.length === 0}>
          <SelectTrigger id="account-default-org" className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_DEFAULT}>
              {orgs.length === 1 ? "My only organization" : "The list of my organizations"}
            </SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Switch organizations any time with the dropdown at the top of the menu.
        </p>
      </div>
    </section>
  );
}

function NameCard({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [name, setName] = useState(me.name);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message);
    setBusy(true);
    try {
      await saveMyName(me.id, parsed.data);
      toast.success("Name saved");
      qc.invalidateQueries();
    } catch (err) {
      toast.error(accountErrorMessage(String((err as Error).message)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-3 rounded-md border bg-card p-5">
      <h2 className="text-lg font-semibold">Name</h2>
      <div className="space-y-1">
        <Label htmlFor="account-name">Your name</Label>
        <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} />
        <p className="text-sm text-muted-foreground">
          Shown on your member record in every organization you belong to.
        </p>
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}

function EmailCard({ me }: { me: Me }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(me.pendingEmail);
  const [busy, setBusy] = useState(false);
  const google = me.provider === "google";
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message);
    if (parsed.data === me.email.toLowerCase())
      return void toast.error("That's already your email.");
    setBusy(true);
    try {
      await changeMyEmail(parsed.data);
      setSent(parsed.data);
      setEmail("");
    } catch (err) {
      toast.error(accountErrorMessage(String((err as Error).message)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-3 rounded-md border bg-card p-5">
      <h2 className="text-lg font-semibold">Sign-in email</h2>
      <p className="text-sm">
        Currently <strong>{me.email}</strong>
      </p>
      {sent && (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          We sent a confirmation link to {sent}. Your email changes once you open it; your member
          records follow.
        </p>
      )}
      {google ? (
        <p className="text-sm text-muted-foreground">Your email comes from your Google account.</p>
      ) : (
        <>
          <div className="space-y-1">
            <Label htmlFor="account-email">New email</Label>
            <Input
              id="account-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy || !email}>
            {busy ? "Sending…" : "Change email"}
          </Button>
        </>
      )}
    </form>
  );
}

function PasswordCard() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse({ password, confirm });
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message);
    setBusy(true);
    try {
      await changeMyPassword(password);
      toast.success("Password changed");
      setPassword("");
      setConfirm("");
    } catch (err) {
      toast.error(accountErrorMessage(String((err as Error).message)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-3 rounded-md border bg-card p-5">
      <h2 className="text-lg font-semibold">Password</h2>
      <div className="space-y-1">
        <Label htmlFor="account-password">New password</Label>
        <Input
          id="account-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="account-confirm">Repeat the new password</Label>
        <Input
          id="account-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={busy || !password}>
        {busy ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
