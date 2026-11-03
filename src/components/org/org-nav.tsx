import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPortal } from "react-dom";
import {
  BarChart3,
  BookUser,
  ChevronDown,
  ChevronRight,
  Contact,
  Landmark,
  LayoutGrid,
  Network,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sidebarItemClass, useSidebarSlot } from "@/components/app-shell";

import { isSettingsSection, type NavItem, type OrgNav } from "./org-nav-items";

export function OrgNavigation({
  nav,
  value,
  onChange,
}: {
  nav: OrgNav;
  value: string;
  onChange: (v: string) => void;
}) {
  const slot = useSidebarSlot();
  const inSettings = isSettingsSection(nav, value);
  const settingsEntry = nav.settings[0]?.value;
  // Settings' pages are listed only while Settings is open (D-188); clicking Settings opens its
  // first page. The Settings heading is emphasised (not highlighted) while one of them is open.
  const link = (item: NavItem, active: boolean, sub = false, open = false, toggle = false) => (
    <button
      type="button"
      onClick={() => onChange(item.value)}
      aria-current={active ? "page" : undefined}
      aria-expanded={toggle ? open : undefined}
      className={cn(sidebarItemClass(active), sub && "py-1.5 pl-10 font-normal")}
    >
      {!sub &&
        ICONS[item.label] &&
        (() => {
          const I = ICONS[item.label]!;
          return <I className="h-4 w-4 shrink-0" />;
        })()}
      <span className="flex-1">{item.label}</span>
      {toggle &&
        (open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
    </button>
  );

  const desktop = (
    <nav aria-label="Organization" className="hidden md:block">
      <ul className="space-y-1">
        {nav.main.map((item) => {
          const isSettings = item.label === "Settings" && item.value === settingsEntry;
          return (
            <li key={item.label}>
              {isSettings
                ? link(item, false, false, inSettings, true)
                : link(item, item.value === value)}
              {isSettings && inSettings && (
                <ul className="mt-0.5 space-y-1" aria-label="Settings">
                  {nav.settings.map((s) => (
                    <li key={s.value}>{link(s, s.value === value, true)}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );

  return (
    <>
      <div className="space-y-2 md:hidden">
        <Select
          value={inSettings && settingsEntry ? settingsEntry : value}
          onValueChange={onChange}
        >
          <SelectTrigger aria-label="Section">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {nav.main.map((i) => (
              <SelectItem key={i.label} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {inSettings && (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger aria-label="Settings page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {nav.settings.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {slot ? createPortal(desktop, slot) : desktop}
    </>
  );
}

const ICONS: Record<string, typeof Users> = {
  Overview: LayoutGrid,
  Members: Users,
  Directory: BookUser,
  Board: Landmark,
  Reports: BarChart3,
  Chapters: Network,
  Settings: Settings,
  Contacts: Contact,
};
