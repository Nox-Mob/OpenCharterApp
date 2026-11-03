import { createFileRoute, redirect } from "@tanstack/react-router";
import { myOrgsQuery } from "@/lib/orgs";
import { defaultOrgIdOf, landingOrgId } from "@/modules/account/landing";

/**
 * Landing after sign-in (D-206): opens your default organization, or your only one, or else the
 * list of your organizations. There's no dashboard page of its own; each organization's
 * Overview is its dashboard and the sidebar's dropdown switches between them.
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async ({ context }) => {
    // fresh, so a default organization that was just deleted or left isn't opened
    const orgs = await context.queryClient.fetchQuery({ ...myOrgsQuery(), staleTime: 0 });
    const id = landingOrgId(orgs, defaultOrgIdOf(context.user));
    throw id
      ? redirect({ to: "/orgs/$orgId", params: { orgId: id }, replace: true })
      : redirect({ to: "/orgs", replace: true });
  },
});
