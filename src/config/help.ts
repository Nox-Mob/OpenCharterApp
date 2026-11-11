// Docs pages linked from OpenCharterApp (S-04, SHARED-SPEC §12.3). The shell's Help link opens
// the page for where you are; every path must exist on docs.openapphub.org.
import { docsUrl, type HelpMap } from "@shared/docs";

export const HELP = {
  home: "charter/",
  overview: "charter/start/overview/",
  members: "charter/members/roster/",
  levels: "charter/membership/levels-and-dues/",
  payments: "charter/money/payments/",
  board: "charter/governance/board-seats/",
  records: "charter/records/audit-log-and-reports/",
  setup: "charter/setup/guided-setup/",
  roles: "hub/accounts/organizations-and-roles/",
  account: "hub/accounts/account-settings/",
  troubleshooting: "charter/help/troubleshooting/",
} satisfies HelpMap;

export type HelpKey = keyof typeof HELP;

// Organization page sections (`?tab=`, src/components/org/org-nav-items.ts).
const SECTION_HELP: Record<string, HelpKey> = {
  overview: "overview",
  members: "members",
  directory: "members",
  board: "board",
  "board-settings": "board",
  reports: "records",
  audit: "records",
  chapters: "overview",
  settings: "setup",
  setup: "setup",
  fields: "setup",
  "chapter-fields": "setup",
  levels: "levels",
  roles: "roles",
  payments: "payments",
};

/** The help page for a location in the app. */
export function helpKeyFor(pathname: string, search: Record<string, unknown> = {}): HelpKey {
  if (/^\/orgs\/[^/]+\/setup\/?$/.test(pathname)) return "setup";
  if (/^\/orgs\/[^/]+\/?$/.test(pathname)) {
    const tab = typeof search["tab"] === "string" ? search["tab"] : "overview";
    return SECTION_HELP[tab] ?? "overview";
  }
  if (pathname === "/orgs" || pathname === "/orgs/") return "overview";
  if (pathname.startsWith("/receipts/")) return "payments";
  if (pathname.startsWith("/join/")) return "levels";
  if (pathname === "/account") return "account";
  return "home";
}

export function helpHrefFor(pathname: string, search: Record<string, unknown> = {}): string {
  return docsUrl(HELP[helpKeyFor(pathname, search)]);
}
