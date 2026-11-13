import { useState, type ReactNode } from "react";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, UserCircle } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppShell as SuiteShell } from "@shared/ui/AppShell";
import { useBilling } from "@/lib/use-billing";
import { helpHrefFor } from "@/config/help";
import { hubUrl, isHosted } from "@shared/supabase/hosted";
import { supabase } from "@/integrations/supabase/client";
import { myOrgsQuery, myPermissionsQuery } from "@/lib/orgs";
import { hasPermission, type Grant } from "@/lib/policy";
import { LegalLinks } from "@/components/legal/legal-page";
import { SidebarSlot } from "@/components/sidebar-slot";
import { RouterLink } from "@/lib/router-link";
import { notificationSettingsHref } from "@/lib/notifications";

/**
 * Every signed-in page sits in the suite's AppShell (shared/ui, SHARED-SPEC §9): sidebar, top bar
 * with the suite and organization switchers, Help and the user menu (theme, sign out), and the
 * billing banner. An organization's own section menu (org-nav.tsx) is portalled into the
 * sidebar slot under the main nav, as before (D-205).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { orgId?: string };
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const search = useRouterState({ select: (r) => r.location.search as Record<string, unknown> });
  const { data: orgs = [] } = useQuery(myOrgsQuery());
  const { data: grants = [] } = useQuery(myPermissionsQuery());
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  const current = orgs.find((o) => o.id === params.orgId) ?? null;
  // The billing state belongs to the OpenAppHub organization (the top unit).
  const suiteOrgId = current?.org_id ?? current?.id ?? null;

  const user = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      return {
        name: (meta["full_name"] ?? meta["display_name"] ?? null) as string | null,
        email: data.user?.email ?? null,
      };
    },
  });
  const billing = useBilling(suiteOrgId);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    if (isHosted()) window.location.assign(hubUrl("/"));
    else navigate({ to: "/auth", replace: true });
  }

  const canManageBilling = !!current && hasPermission(grants as Grant[], "org.manage", current);

  return (
    <SidebarSlot.Provider value={slot}>
      <SuiteShell
        app="charter"
        nav={[
          {
            label: "Organizations",
            href: "/orgs",
            icon: <LayoutGrid aria-hidden="true" />,
            current: pathname === "/orgs",
          },
        ]}
        navFooter={[
          {
            label: "Account",
            href: "/account",
            icon: <UserCircle aria-hidden="true" />,
            current: pathname === "/account",
          },
        ]}
        sidebar={<div ref={setSlot} />}
        user={user.data ?? null}
        orgs={orgs.map((o) => ({ id: o.id, name: o.name }))}
        currentOrgId={current?.id ?? null}
        onSelectOrg={(id) => navigate({ to: "/orgs/$orgId", params: { orgId: id } })}
        orgCreateHref={isHosted() ? hubUrl("/orgs/new") : "/orgs"}
        billing={billing.data ?? null}
        canManageBilling={canManageBilling}
        billingHref={hubUrl("/billing")}
        helpHref={helpHrefFor(pathname, search)}
        notificationsClient={supabase as unknown as SupabaseClient}
        notificationSettingsHref={notificationSettingsHref()}
        onSignOut={() => void signOut()}
        LinkComponent={RouterLink}
      >
        {children}
        <footer className="mt-12 border-t pt-6">
          <LegalLinks />
        </footer>
      </SuiteShell>
    </SidebarSlot.Provider>
  );
}
