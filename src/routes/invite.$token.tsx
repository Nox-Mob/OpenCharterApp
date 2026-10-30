import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Accept invitation — OpenCharterApp" },
      { name: "description", content: "Join an organization on OpenCharterApp." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Accept invitation — OpenCharterApp" },
      { property: "og:description", content: "Join an organization on OpenCharterApp." },
    ],
  }),
  component: InvitePage,
});

type State = { kind: "loading" } | { kind: "signed-out" } | { kind: "invalid" } | { kind: "ready"; org: string };

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const here = `/invite/${token}`;

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return setState({ kind: "signed-out" });
      const { data } = await supabase.rpc("get_invitation", { _token: token });
      const row = data?.[0];
      setState(row?.usable ? { kind: "ready", org: row.org_name } : { kind: "invalid" });
    })();
  }, [token]);

  // Accepting happens only on an explicit button press (POST), never on page load.
  async function accept() {
    setBusy(true);
    const { data, error } = await supabase.rpc("accept_invitation", { _token: token });
    setBusy(false);
    if (error) return void toast.error(error.message.includes("different email") ? "This invitation was sent to a different email address." : "This invitation can't be used.");
    navigate({ to: "/orgs/$orgId", params: { orgId: data as string } });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rule-brass bg-card p-8 text-center">
        <Link to="/" className="font-display text-xl font-semibold text-primary">OpenCharter</Link>
        {state.kind === "loading" && <p className="mt-6 text-muted-foreground">Checking your invitation…</p>}
        {state.kind === "signed-out" && (
          <>
            <h1 className="mt-4 text-2xl font-semibold">You've been invited</h1>
            <p className="mt-2 text-muted-foreground">Sign in or create an account with the email this invitation was sent to.</p>
            <Button asChild className="mt-6"><Link to="/auth" search={{ redirect: here }}>Continue</Link></Button>
          </>
        )}
        {state.kind === "invalid" && (
          <>
            <h1 className="mt-4 text-2xl font-semibold">Invitation unavailable</h1>
            <p className="mt-2 text-muted-foreground">This link has expired, was already used, or was revoked. Ask for a new one.</p>
          </>
        )}
        {state.kind === "ready" && (
          <>
            <h1 className="mt-4 text-2xl font-semibold">Join {state.org}</h1>
            <p className="mt-2 text-muted-foreground">Your profile here stays separate from any other organization you belong to.</p>
            <Button className="mt-6" onClick={accept} disabled={busy}>{busy ? "Joining…" : "Accept invitation"}</Button>
          </>
        )}
      </div>
    </div>
  );
}
