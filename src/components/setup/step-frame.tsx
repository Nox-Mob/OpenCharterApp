import { useEffect, useRef } from "react";

/**
 * Setup step card (setup-engine.md §8: mobile-friendly). The title stays at the top and the
 * navigation buttons stay at the bottom while the step's content scrolls, so long field or
 * level lists never push Back / Save and continue off-screen. The body scrolls back to the
 * top whenever `scrollKey` changes (a new step).
 */
export function SetupStepFrame({
  header,
  footer,
  scrollKey,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  scrollKey?: string | number;
  children: React.ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.scrollTo?.({ top: 0 });
  }, [scrollKey]);
  return (
    <section className="mt-6 flex max-h-[calc(100dvh-12rem)] min-h-[20rem] flex-col rule-brass bg-card">
      <div className="border-b px-6 pb-4 pt-6">{header}</div>
      <div
        ref={body}
        data-testid="setup-step-scroll"
        className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
      >
        {children}
      </div>
      <div className="flex justify-between border-t px-6 py-4">{footer}</div>
    </section>
  );
}
