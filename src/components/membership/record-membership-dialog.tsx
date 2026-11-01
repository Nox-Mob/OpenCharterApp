import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Org } from "@/lib/orgs";
import { tiersQuery } from "@/modules/membership/queries";
import {
  formatPrice,
  lengthOf,
  parsePrice,
  priceInput,
  termEndDate,
  termLabel,
} from "@/modules/membership/tiers";
import {
  membershipErrorMessage,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  recordMembership,
  recordMembershipSchema,
  type MemberRow,
  type PaymentMethod,
} from "@/modules/membership/memberships";
import { renewalStart, standing, today } from "@/modules/membership/standing";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Record a join or renewal paid outside the app (E-13a). Shows the period it will cover:
 * renewals in good standing or grace stack on paid-through; others start on the paid date.
 */
export function RecordMembershipDialog({
  org,
  member,
  graceDays,
  canRecordPayments,
  open,
  onClose,
}: {
  org: Org;
  member: MemberRow;
  graceDays: number;
  canRecordPayments: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const tiers = useQuery(tiersQuery(org.id, org.ancestor_ids));
  const options = useMemo(
    () =>
      (tiers.data ?? [])
        .filter((t) => t.org_id === org.id && t.active)
        .flatMap((t) =>
          t.terms
            .filter((x) => x.active !== false && x.id)
            .map((x) => ({ tier: t, term: x, id: x.id! })),
        ),
    [tiers.data, org.id],
  );
  const m = member.membership;
  const renewing = m?.status === "active";
  const [termId, setTermId] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  const [withPayment, setWithPayment] = useState(canRecordPayments);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Default to the member's current term, or the first one offered.
    if (termId || options.length === 0) return;
    const current = options.find((o) => o.id === m?.term_id);
    const pick = current ?? options[0]!;
    setTermId(pick.id);
    setAmount(priceInput(pick.term.price_minor));
  }, [options, termId, m?.term_id]);

  const chosen = options.find((o) => o.id === termId);
  const start =
    startsOn ||
    (m && m.status === "active" ? renewalStart(m, graceDays, paidOn || today()) : paidOn);
  const end = chosen && start ? termEndDate(start, lengthOf(chosen.term)) : null;
  const lapsed = m ? standing(m, graceDays, paidOn || today()) === "lapsed" : false;

  async function save() {
    const amountMinor = withPayment ? parsePrice(amount) : null;
    if (withPayment && amountMinor === null) return void toast.error("Enter an amount like 25.00");
    const parsed = recordMembershipSchema.safeParse({
      term_id: termId,
      paid_on: paidOn,
      amount_minor: amountMinor,
      method: withPayment ? method : null,
      note,
      starts_on: startsOn || null,
    });
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Check the form");
    setBusy(true);
    try {
      await recordMembership(member.id, parsed.data);
      toast.success(renewing ? "Renewal recorded" : "Membership recorded");
      qc.invalidateQueries({ queryKey: ["members", org.id] });
      qc.invalidateQueries({ queryKey: ["membership-history"] });
      onClose();
    } catch (e) {
      toast.error(membershipErrorMessage(String((e as Error).message)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 pb-4 pt-6">
          <DialogTitle>
            {renewing ? "Record a renewal" : "Record a membership"} for{" "}
            {member.display_name || member.email}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add a membership level on the Membership levels tab first.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Level and term</Label>
                <Select
                  value={termId}
                  onValueChange={(v) => {
                    setTermId(v);
                    const o = options.find((x) => x.id === v);
                    if (o) setAmount(priceInput(o.term.price_minor));
                  }}
                >
                  <SelectTrigger aria-label="Level and term">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.tier.name}: {termLabel(lengthOf(o.term))} ·{" "}
                        {formatPrice(o.term.price_minor, o.term.currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="paid-on">{renewing ? "Renewed on" : "Joined / paid on"}</Label>
                <Input
                  id="paid-on"
                  type="date"
                  value={paidOn}
                  onChange={(e) => setPaidOn(e.target.value)}
                />
              </div>
              {!renewing && (
                <div className="space-y-2">
                  <Label htmlFor="starts-on">Membership started (optional)</Label>
                  <Input
                    id="starts-on"
                    type="date"
                    value={startsOn}
                    onChange={(e) => setStartsOn(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    For historical members. Leave blank to start on the date above.
                  </p>
                </div>
              )}
              {canRecordPayments && (
                <fieldset className="space-y-3 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={withPayment}
                      onCheckedChange={(c) => setWithPayment(c === true)}
                      aria-label="Record a payment"
                    />
                    Record a payment
                  </label>
                  {withPayment && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="amount" className="text-xs">
                          Amount ($)
                        </Label>
                        <Input
                          id="amount"
                          inputMode="decimal"
                          value={amount}
                          aria-invalid={parsePrice(amount) === null}
                          onChange={(e) => setAmount(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Paid by</Label>
                        <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                          <SelectTrigger aria-label="Payment method">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHODS.map((p) => (
                              <SelectItem key={p} value={p}>
                                {PAYMENT_METHOD_LABELS[p]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </fieldset>
              )}
              <div className="space-y-2">
                <Label htmlFor="note">Note (optional)</Label>
                <Input
                  id="note"
                  value={note}
                  placeholder="e.g. Check #1042"
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              {chosen && start && (
                <p className="rounded-md bg-muted p-3 text-sm" data-testid="period-preview">
                  {end ? `Covers ${start} through ${end}` : `Lifetime membership from ${start}`}
                  {renewing && !startsOn && !lapsed && m?.paid_through
                    ? ". Added on after the current paid-through date."
                    : renewing && lapsed
                      ? ". The membership had lapsed, so the new term starts on the renewal date."
                      : "."}
                </p>
              )}
            </>
          )}
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button onClick={save} disabled={busy || options.length === 0}>
            {busy ? "Saving…" : renewing ? "Record renewal" : "Record membership"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
