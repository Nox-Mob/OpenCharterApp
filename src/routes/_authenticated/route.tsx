import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hubUrl, isHosted, loginRedirect } from "@shared/supabase/hosted";
import { TwoStepGate, TwoStepNotice } from "@shared/ui/TwoStep";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      // Hosted: sign in once in OpenAppHub and come back here.
      if (isHosted()) throw redirect({ href: loginRedirect(window.location.href) });
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: () => (
    <AppShell>
      {/* Two-step sign-in (security review round 2): the code prompt, and a notice for
          organizations that require it of owners and admins. */}
      <TwoStepGate
        client={supabase as unknown as SupabaseClient}
        {...(isHosted() ? { recoverHref: hubUrl("/recover") } : {})}
        onSignOut={() => void supabase.auth.signOut().then(() => window.location.assign("/"))}
      >
        <div className="mb-4 empty:hidden">
          <TwoStepNotice
            client={supabase as unknown as SupabaseClient}
            accountHref={isHosted() ? hubUrl("/account#two-step") : "/account"}
          />
        </div>
        <Outlet />
      </TwoStepGate>
    </AppShell>
  ),
});
