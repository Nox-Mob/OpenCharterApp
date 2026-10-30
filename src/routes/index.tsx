import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OpenCharterApp — membership software for associations and chapters" },
      { name: "description", content: "Open-source membership platform for national associations and their local chapters: members, dues, governance and receipts." },
      { property: "og:title", content: "OpenCharterApp — membership for associations and chapters" },
      { property: "og:description", content: "Open-source membership platform for national associations and their local chapters." },
    ],
  }),
  component: Index,
});

const points = [
  ["Each chapter stands alone", "Every organization collects into its own payment account and issues its own receipts."],
  ["National sets the guardrails", "Define rules once; chapters operate within them, and you see compliance at a glance."],
  ["Configured, not coded", "Your terms, tiers, titles and attributes, set up through a guided flow."],
] as const;

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-xl font-semibold text-primary">OpenCharter</span>
        <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
      </header>
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16">
        <p className="text-sm font-medium uppercase tracking-widest text-brass">Open source · AGPL</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight md:text-6xl">
          Run your association, and every chapter in it.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Members, dues, boards and receipts for non-profits with a national office and local chapters.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg"><Link to="/auth">Get started</Link></Button>
        </div>
        <div className="mt-20 grid gap-8 md:grid-cols-3">
          {points.map(([t, d]) => (
            <div key={t} className="rule-brass pt-4">
              <h2 className="text-xl font-semibold">{t}</h2>
              <p className="mt-2 text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
