import { createFileRoute, redirect } from "@tanstack/react-router";
import { myOrgsQuery } from "@/lib/orgs";
import { defaultOrgIdOf, landingOrgId } from "@/modules/account/landing";
import { getCurrentOrgCookie } from "../../../shared/supabase/org";
import { isHosted } from "@shared/supabase/hosted";
import { hubOrgsQuery } from "@/lib/hub-orgs";

/**
 * Landing after sign-in (D-206): opens your default organization, or your only one, or else the
 * list of your organizations. There's no dashboard page of its own; each organization's
 * Overview is its dashboard and the sidebar's dropdown switches between them.
 * Hosted, someone with no organization here yet but exactly one in OpenAppHub (the usual first
 * visit after creating it in the hub) goes straight to setting that one up.
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async ({ context }) => {
    // fresh, so a default organization that was just deleted or left isn't opened
    const orgs = await context.queryClient.fetchQuery({ ...myOrgsQuery(), staleTime: 0 });
    let id = landingOrgId(orgs, defaultOrgIdOf(context.user), getCurrentOrgCookie());
    if (!id && orgs.length === 0 && isHosted()) {
      const hubOrgs = await context.queryClient
        .fetchQuery({ ...hubOrgsQuery(), staleTime: 0 })
        .catch(() => []);
      id = landingOrgId(hubOrgs, null, getCurrentOrgCookie());
    }
    throw id
      ? redirect({ to: "/orgs/$orgId", params: { orgId: id }, replace: true })
      : redirect({ to: "/orgs", replace: true });
  },
});
