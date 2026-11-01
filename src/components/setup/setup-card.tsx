import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";
import { hasNewOptions, setupStateQuery } from "@/modules/setup/drafts";
import { membershipFlow } from "@/modules/membership/setup-flow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STATUS: Record<string, string> = {
  in_progress: "In progress",
  applied: "Done",
  needs_review: "Needs review",
};

export function SetupCard({ org }: { org: Org }) {
  const { data } = useQuery(setupStateQuery(org.id, membershipFlow.id));
  const fresh = hasNewOptions(data, membershipFlow.version);
  return (
    <section className="max-w-xl rule-brass bg-card p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">{membershipFlow.title}</h2>
        <Badge variant={data?.status === "applied" ? "secondary" : "default"}>
          {data ? STATUS[data.status] : "Not started"}
        </Badge>
        {fresh && <Badge>New setup options</Badge>}
      </div>
      {fresh && (
        <p className="mt-2 text-sm">
          New questions were added since you finished setup, such as membership levels. Your current
          answers are kept.
        </p>
      )}
      <p className="mt-2 text-muted-foreground">{membershipFlow.description}</p>
      <Button asChild className="mt-4">
        <Link to="/orgs/$orgId/setup" params={{ orgId: org.id }}>
          {!data
            ? "Start setup"
            : data.status === "applied"
              ? fresh
                ? "See what's new"
                : "Review or change"
              : "Continue setup"}
        </Link>
      </Button>
    </section>
  );
}
