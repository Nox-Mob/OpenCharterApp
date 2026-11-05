import { createFileRoute } from "@tanstack/react-router";
import { RequiresDatabase } from "@/components/db/requires-database";
import { JoinForm } from "@/components/membership/join-form";

export const Route = createFileRoute("/join/$orgSlug/")({
  ssr: false,
  // ?chapter=<id> preselects the home chapter (A8), e.g. from a chapter's join page
  validateSearch: (s: Record<string, unknown>): { chapter?: string } =>
    typeof s["chapter"] === "string" ? { chapter: s["chapter"] } : {},
  head: () => ({
    meta: [
      { title: "Join — OpenCharterApp" },
      { name: "description", content: "Become a member online." },
      { property: "og:title", content: "Join — OpenCharterApp" },
      { property: "og:description", content: "Become a member online." },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { orgSlug } = Route.useParams();
  const { chapter } = Route.useSearch();
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <RequiresDatabase feature="joining">
        <JoinForm orgSlug={orgSlug} chapter={chapter} />
      </RequiresDatabase>
    </main>
  );
}
