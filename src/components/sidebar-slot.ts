import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

/**
 * The app's left sidebar (D-205): pages put their own section links into it through this slot
 * (the org menu), and its items share one look. Kept apart from app-shell.tsx so that file only
 * exports components (fast refresh).
 */
export const SidebarSlot = createContext<HTMLElement | null>(null);
export const useSidebarSlot = () => useContext(SidebarSlot);

export const sidebarItemClass = (active: boolean) =>
  cn(
    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    active
      ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
      : "text-sidebar-foreground",
  );
