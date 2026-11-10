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
    // The suite's nav look (shared AppShell): accent background and the app-colour bar.
    "relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
    active
      ? "bg-accent text-foreground before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[3px] before:rounded-full before:bg-app-accent [&_svg]:text-app-accent"
      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  );
