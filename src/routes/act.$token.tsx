import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isHosted, loginRedirect } from "@shared/supabase/hosted";
import { ActionLinkPage } from "@shared/ui/ActionLink";
import { supabase } from "@/integrations/supabase/client";

// A signed link from an email (core 0014, C-08), e.g. Approve on a join request: says what it will
// do, then Confirm, signed in as the person it was sent to. Nothing happens on opening the link.
export const Route = createFileRoute("/act/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Confirm — OpenCharterApp" }, { name: "robots", content: "noindex" }],
  }),
  component: ActPage,
});

function ActPage() {
  const { token } = Route.useParams();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <ActionLinkPage
        client={supabase as unknown as SupabaseClient}
        token={token}
        app="charter"
        signInHref={(next) =>
          isHosted() ? loginRedirect(next) : `/auth?redirect=${encodeURIComponent(next)}`
        }
      />
    </main>
  );
}
