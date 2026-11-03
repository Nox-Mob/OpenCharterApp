import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/** One section of a legal page. */
export type LegalSection = { heading: string; body: ReactNode };

/**
 * Privacy policy and terms of service (U5, D-193). The text is a placeholder the owner replaces
 * before launch; until then a banner says so. Edit `src/content/legal.tsx`.
 */
export function LegalPage({
  title,
  updated,
  placeholder,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  placeholder: boolean;
  intro: ReactNode;
  sections: readonly LegalSection[];
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <p className="text-sm">
        <Link to="/" className="text-muted-foreground hover:underline">
          ← OpenCharter
        </Link>
      </p>
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">Last updated: {updated}</p>
      {placeholder && (
        <p
          role="note"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
        >
          Placeholder text: this page will be replaced with the final wording before OpenCharterApp
          is used with real members. Words in [brackets] are still to be filled in.
        </p>
      )}
      <div className="space-y-3 leading-relaxed">{intro}</div>
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
