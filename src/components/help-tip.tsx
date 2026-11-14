import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * A "?" button next to a setting that opens a short explanation. A popover, not a hover-only
 * tooltip, so it works with a tap on phones and tablets and with the keyboard.
 */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={label}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        ?
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] text-sm leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}
