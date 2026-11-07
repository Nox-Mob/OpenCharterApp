import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/** One section of a legal page. */
export type LegalSection = { heading: string; body: ReactNode };

/**
 * Privacy policy and terms of service (U5, D-193, D-210). The text lives in
 * `src/content/legal.tsx`; while `placeholder` is set a banner says the wording isn't final.
 */
export function LegalPage({
  title,
  effective,
  updated,
  operator,
  placeholder,
  intro,
  sections,
}: {
  title: string;
  effective: string;
  updated: string;
  operator: string;
  placeholder: boolean;
  intro?: ReactNode;
  sections: readonly LegalSection[];
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <p className="text-sm">
        <Link to="/" className="text-muted-foreground hover:underline">
          ← OpenCharterApp
        </Link>
      </p>
      <h1 className="text-3xl font-semibold">{title}</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <dt>Effective date:</dt>
        <dd>{effective}</dd>
        <dt>Last updated:</dt>
        <dd>{updated}</dd>
        <dt>Operating organization:</dt>
        <dd>{operator}</dd>
      </dl>
      {placeholder && (
        <p
          role="note"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
        >
          Placeholder text: this page will be replaced with the final wording before OpenCharterApp
          is used with real members. Words in [brackets] are still to be filled in.
        </p>
      )}
      {intro && <div className="space-y-3 leading-relaxed">{intro}</div>}
      {sections.map((s, i) => (
        <section key={s.heading} className="space-y-2">
          <h2 className="text-xl font-semibold">
            {i + 1}. {s.heading}
          </h2>
          <div className="space-y-2 leading-relaxed">{s.body}</div>
        </section>
      ))}
      <LegalLinks />
    </main>
  );
}

/** Links to the privacy policy and terms, for footers and forms. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`text-sm text-muted-foreground ${className}`}>
      <Link to="/privacy" className="hover:underline">
        Privacy policy
      </Link>
      <span aria-hidden="true"> · </span>
      <Link to="/terms" className="hover:underline">
        Terms of service
      </Link>
    </nav>
  );
}
