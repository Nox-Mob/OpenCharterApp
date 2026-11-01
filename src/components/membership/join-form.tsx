import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { coerceInput, validateValue } from "@/engines/attributes";
import type { DefWithOptions } from "@/modules/attributes/queries";
import {
  beginJoin,
  joinAnswers,
  joinBlocker,
  joinErrorMessage,
  joinInfoQuery,
  type JoinField,
} from "@/modules/membership/joining";
import { formatPrice, lengthOf, termLabel } from "@/modules/membership/tiers";
import { startCheckout } from "@/modules/payments/payments.functions";
import { AttributeValueInput } from "@/components/attributes/attribute-value-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** The join form's fields, shaped for the shared value inputs. */
function toDef(f: JoinField): DefWithOptions {
  return {
    id: f.id,
    org_id: "",
    key: f.id,
    label: f.label,
    data_type: f.data_type,
    required: f.required,
    visibility: "members",
    member_editable: true,
    show_in_directory: false,
    locked: false,
    sort_order: 0,
    active: true,
    applies_to: "member",
    options: f.options.map((o, i) => ({ ...o, sort_order: i, active: true })),
  };
}

/** The public join form (E-13b): choose a membership, sign in, answer fields, pay. */
export function JoinForm({ orgSlug }: { orgSlug: string }) {
  const info = useQuery(joinInfoQuery(orgSlug));
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [termId, setTermId] = useState("");
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);
  const defs = useMemo(() => (info.data?.fields ?? []).map(toDef), [info.data]);

  if (info.isLoading || signedIn === null) return <p className="text-muted-foreground">Loading…</p>;
  if (!info.data)
    return <p className="text-muted-foreground">We couldn't find that organization.</p>;
  const j = info.data;
  const blocker = joinBlocker(j);
  const terms = j.levels.flatMap((l) => l.terms.map((t) => ({ level: l, term: t })));
  const chosen =
    terms.find((x) => x.term.id === termId) ?? (terms.length === 1 ? terms[0] : undefined);
  const here = `/join/${orgSlug}`;

  async function pay() {
    if (!chosen) return void toast.error("Choose a membership");
    for (const d of defs) {
      const err = validateValue(d, d.options, coerceInput(d.data_type, draft[d.id]));
      if (err) return void toast.error(err);
    }
    setBusy(true);
    try {
      const answers = Object.fromEntries(
        Object.entries(joinAnswers(j.fields, draft)).map(([id, v]) => [
          id,
          coerceInput(defs.find((d) => d.id === id)!.data_type, v),
        ]),
      );
      const paymentId = await beginJoin(j.org.id, chosen.term.id, answers);
      const { url } = await startCheckout({ data: { paymentId } });
      window.location.assign(url);
    } catch (e) {
      toast.error(joinErrorMessage(String((e as Error).message)));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rule-brass pt-6">
        <p className="text-sm text-muted-foreground">Become a member of</p>
        <h1 className="text-3xl font-semibold">{j.org.name}</h1>
        {j.payments_enabled && !j.livemode && (
          <Badge variant="secondary" className="mt-2">
            Test payments: no real money is charged
          </Badge>
        )}
      </div>

      {blocker ? (
        <div className="space-y-3 rounded-md border bg-card p-5">
          <p>{blocker}</p>
          {j.levels_managed_by_parent && j.parent && (
            <Button asChild variant="outline">
              <Link to="/join/$orgSlug" params={{ orgSlug: j.parent.slug }}>
                Join {j.parent.name}
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <fieldset className="space-y-3">
            <legend className="text-lg font-semibold">Choose your membership</legend>
            {j.levels.map((l) => (
              <div key={l.id} className="rounded-md border bg-card p-4">
                <p className="font-medium">{l.name}</p>
                {l.description && <p className="text-sm text-muted-foreground">{l.description}</p>}
                <div className="mt-3 space-y-2">
                  {l.terms.map((t) => (
                    <label key={t.id} className="flex items-center gap-3 text-sm">
                      <input
                        type="radio"
                        name="term"
                        value={t.id}
                        checked={chosen?.term.id === t.id}
                        onChange={() => setTermId(t.id)}
                      />
                      <span>
                        {termLabel(lengthOf(t))} · {formatPrice(t.price_minor, t.currency)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

          {!signedIn ? (
            <div className="space-y-3 rounded-md border bg-card p-5">
              <p>Sign in, or create an account with your email, to continue.</p>
              <Button asChild>
                <Link to="/auth" search={{ redirect: here }}>
                  Sign in or create an account
                </Link>
              </Button>
            </div>
          ) : (
            <>
              {defs.length > 0 && (
                <fieldset className="space-y-4">
                  <legend className="text-lg font-semibold">About you</legend>
                  {defs.map((d) => (
                    <div key={d.id} className="space-y-1">
                      <Label>
                        {d.label}
                        {d.required ? " *" : ""}
                      </Label>
                      {j.fields.find((f) => f.id === d.id)?.help && (
                        <p className="text-sm text-muted-foreground">
                          {j.fields.find((f) => f.id === d.id)!.help}
                        </p>
                      )}
                      <AttributeValueInput
                        def={d}
                        value={draft[d.id]}
                        onChange={(v) => setDraft({ ...draft, [d.id]: v })}
                      />
                    </div>
                  ))}
                </fieldset>
              )}
              {j.approval_required && (
                <p className="rounded-md bg-muted p-3 text-sm">
                  An admin reviews new members. You pay now; if your application is declined, you're
                  refunded in full.
                </p>
              )}
              <Button onClick={pay} disabled={busy || !chosen} className="w-full sm:w-auto">
                {busy
                  ? "Opening payment…"
                  : chosen
                    ? `Continue to payment (${formatPrice(chosen.term.price_minor, chosen.term.currency)})`
                    : "Choose a membership"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Payment is handled by {j.gateway === "test" ? "a test checkout" : "Stripe"} on
                behalf of {j.org.name}. Card details never reach OpenCharterApp.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
