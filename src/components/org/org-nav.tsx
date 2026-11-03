import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
      className={cn(
        "w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted",
        sub && "pl-6",
        active ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
        open && "font-medium text-foreground",
      )}
    >
      {item.label}
    </button>
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
      <nav aria-label="Organization" className="hidden md:block">
        <ul className="space-y-0.5">
          {nav.main.map((item) => {
            const isSettings = item.label === "Settings" && item.value === settingsEntry;
            return (
              <li key={item.label}>
                {isSettings
                  ? link(item, false, false, inSettings, true)
                  : link(item, item.value === value)}
                {isSettings && inSettings && (
                  <ul className="mt-0.5 space-y-0.5" aria-label="Settings">
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
    </>
  );
}
