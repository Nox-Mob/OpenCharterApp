import { createContext, useContext, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, LogOut, UserCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { myOrgsQuery } from "@/lib/orgs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LegalLinks } from "@/components/legal/legal-page";
import { cn } from "@/lib/utils";

/** Pages put their own section links into the sidebar through this slot (org nav). */
const SidebarSlot = createContext<HTMLElement | null>(null);
export const useSidebarSlot = () => useContext(SidebarSlot);

export const sidebarItemClass = (active: boolean) =>
  cn(
    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    active
      ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
      : "text-sidebar-foreground",
  );

export function AppShell({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { orgId?: string };
  const { data: orgs = [] } = useQuery(myOrgsQuery());
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const orgSwitcher = orgs.length > 0 && (
    <Select
      value={params.orgId ?? ""}
      onValueChange={(id) => navigate({ to: "/orgs/$orgId", params: { orgId: id } })}
    >
      <SelectTrigger className="w-full bg-background" aria-label="Switch organization">
        <SelectValue placeholder="Switch organization" />
      </SelectTrigger>
      <SelectContent>
        {orgs.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const accountLinks = (
    <>
      <Link
        to="/account"
        className={sidebarItemClass(false)}
        activeProps={{ className: sidebarItemClass(true) }}
      >
        <UserCircle className="h-4 w-4 shrink-0" />
        Account
      </Link>
      <button type="button" onClick={signOut} className={sidebarItemClass(false)}>
        <LogOut className="h-4 w-4 shrink-0" />
        Sign out
      </button>
    </>
  );

  return (
    <SidebarSlot.Provider value={slot}>
      <div className="flex min-h-screen w-full bg-background">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
          <div className="space-y-3 border-b px-4 py-4">
            <Link to="/dashboard" className="block font-display text-lg font-semibold text-primary">
              OpenCharter
            </Link>
            {orgSwitcher}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <Link
              to="/dashboard"
              className={sidebarItemClass(false)}
              activeProps={{ className: sidebarItemClass(true) }}
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              Dashboard
            </Link>
            <div ref={setSlot} className="mt-2" />
          </div>
          <div className="space-y-1 border-t px-3 py-3">{accountLinks}</div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b bg-card px-4 py-3 md:hidden">
            <Link to="/dashboard" className="font-display text-lg font-semibold text-primary">
              OpenCharter
            </Link>
            <div className="min-w-0 flex-1">{orgSwitcher}</div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
          <div className="space-y-1 border-t px-3 py-3 md:hidden">{accountLinks}</div>
          <footer className="mx-auto w-full max-w-6xl border-t px-4 py-6">
            <LegalLinks />
          </footer>
        </div>
      </div>
    </SidebarSlot.Provider>
  );
}
