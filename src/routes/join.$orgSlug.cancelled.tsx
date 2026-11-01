import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/join/$orgSlug/cancelled")({
  head: () => ({
    meta: [{ title: "Payment cancelled — OpenCharterApp" }, { name: "robots", content: "noindex" }],
  }),
  component: Cancelled,
});

function Cancelled() {
  const { orgSlug } = Route.useParams();
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">Payment cancelled</h1>
      <p className="text-muted-foreground">No payment was made and nothing was changed.</p>
      <Button asChild>
        <Link to="/join/$orgSlug" params={{ orgSlug }}>
          Back to joining
        </Link>
      </Button>
    </main>
  );
}
