import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import { connectionQuery } from "@/modules/payments/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * "Share your join page" on the admin Overview (U6, D-194): the address people join and renew
 * at, with Copy. Until payments are connected the page can't take members yet, so it says so and
 * points to Settings → Payments.
 */
export function ShareJoinPage({
  org,
  onOpenPayments,
}: {
  org: Org;
  /** Opens Settings → Payments, when the viewer may see it. */
  onOpenPayments?: () => void;
}) {
  const conn = useQuery(connectionQuery(org.id));
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/join/${org.slug}`;
  const ready = conn.data?.status === "verified";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Join page address copied");
    } catch {
      toast.error("Couldn't copy; select the address and copy it instead");
    }
  }

  return (
    <section aria-labelledby="share-join" className="space-y-3 rounded-md border bg-card p-5">
      <h2 id="share-join" className="text-lg font-semibold">
        Share your join page
      </h2>
      <p className="text-sm text-muted-foreground">
        Where people join {org.name} and renew. Put it in your newsletter, on your website or in an
        email.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input readOnly value={url} aria-label="Join page address" className="max-w-md" />
        <Button variant="outline" onClick={() => void copy()}>
          Copy
        </Button>
        <Button variant="ghost" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            Open
          </a>
        </Button>
      </div>
      {!conn.isLoading && !ready && (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Online joining opens once payments are connected.{" "}
          {onOpenPayments && (
            <button type="button" className="underline" onClick={onOpenPayments}>
              Connect payments
            </button>
          )}
        </p>
      )}
    </section>
  );
}
