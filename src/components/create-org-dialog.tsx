import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createOrgSchema, slugify, type OrgType } from "@/lib/policy";
import { myOrgsQuery, myPermissionsQuery } from "@/lib/orgs";
import { useFeatureReady } from "@/lib/db/readiness";
import { canSetChapterField } from "@/modules/attributes/chapter-fields";
import { attributeDefsQuery } from "@/modules/attributes/queries";
import { firstValueError, saveAttributeValues } from "@/modules/attributes/values";
import {
  plannedInvites,
  requiredChapterSeatsQuery,
  sendInvites,
  STEP_TITLES,
  wizardInvitesSchema,
  wizardSteps,
  type SentInvite,
  type WizardInvites,
} from "@/modules/chapters/creation";
import { AttributeValueInput } from "@/components/attributes/attribute-value-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY_INVITES: WizardInvites = { admin: "", officers: {} };

/**
 * Create an organization. Under a parent this is the chapter creation wizard (E-16): basics,
 * the parent's chapter fields, a first admin, and officers for the required seats.
 */
export function CreateOrgDialog({
  parentId = null,
  trigger,
  onCreated,
}: {
  parentId?: string | null;
  trigger: React.ReactNode;
  onCreated?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const types: OrgType[] = parentId ? ["chapter", "region"] : ["standalone", "national"];
  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState<OrgType>(types[0]!);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<Record<string, unknown>>({});
  const [invites, setInvites] = useState<WizardInvites>(EMPTY_INVITES);
  const [created, setCreated] = useState<{ id: string; name: string; sent: SentInvite[] } | null>(
    null,
  );
  // Chapter fields defined by the parent or its ancestors are asked for at creation (D-061).
  const orgs = useQuery({ ...myOrgsQuery(), enabled: !!parentId });
  const parent = orgs.data?.find((o) => o.id === parentId);
  const lineage = parent ? [...parent.ancestor_ids, parent.id] : [];
  const defs = useQuery({
    ...attributeDefsQuery(parentId ?? "", parent?.ancestor_ids ?? []),
    enabled: !!parent,
  });
  const grants = useQuery({ ...myPermissionsQuery(), enabled: !!parentId });
  const boardReady = useFeatureReady("board") === true;
  const seats = useQuery({
    ...requiredChapterSeatsQuery(lineage),
    enabled: !!parent && boardReady && type === "chapter",
  });
  // Only fields this person may set on the new chapter; locked ones need the defining org's admins.
  const newChapter = { id: "new", ancestor_ids: lineage };
  const chapterFields =
    type === "chapter"
      ? (defs.data ?? []).filter(
          (d) =>
            d.applies_to === "chapter" &&
            d.active &&
            canSetChapterField(d, newChapter, grants.data ?? []),
        )
      : [];
  const requiredSeats = type === "chapter" ? (seats.data ?? []) : [];
  const steps = wizardSteps({
    isChild: !!parentId,
    type,
    hasFields: chapterFields.length > 0,
    requiredSeats: requiredSeats.length,
  });
  const step = steps[Math.min(stepIdx, steps.length - 1)]!;
  const lastInput = stepIdx === steps.length - 2;
  // The steps depend on the parent's fields and seats; wait for them so none is skipped.
  const stepsLoading =
    !!parentId && (orgs.isLoading || defs.isLoading || (type === "chapter" && seats.isLoading));

  function reset() {
    setStepIdx(0);
    setName("");
    setSlug("");
    setType(types[0]!);
    setDetails({});
    setInvites(EMPTY_INVITES);
    setCreated(null);
  }

  function checkStep(): string | null {
    if (step === "basics") {
      const parsed = createOrgSchema.safeParse({
        name,
        slug: slug || slugify(name),
        type,
        parentId,
      });
      return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Invalid input");
    }
    if (step === "details") return firstValueError(chapterFields, details);
    if (step === "admin" || step === "officers") {
      const parsed = wizardInvitesSchema.safeParse(invites);
      return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Check the emails");
    }
    return null;
  }

  async function next() {
    const err = checkStep();
    if (err) return void toast.error(err);
    if (lastInput) return void (await create());
    setStepIdx(stepIdx + 1);
  }

  async function create() {
    const parsed = createOrgSchema.parse({ name, slug: slug || slugify(name), type, parentId });
    setBusy(true);
    const { data, error } = await supabase.rpc("create_organization", {
      _name: parsed.name,
      _slug: parsed.slug,
      _type: parsed.type,
      ...(parsed.parentId ? { _parent: parsed.parentId } : {}),
    });
    if (error) {
      setBusy(false);
      return void toast.error(
        error.message.includes("duplicate") ? "That web address is taken" : error.message,
      );
    }
    const id = data as string;
    try {
      await saveAttributeValues(chapterFields, id, details);
    } catch {
      toast.warning("Some chapter details weren't saved. Add them on the chapter's overview.");
    }
    const sent = await sendInvites(
      id,
      plannedInvites(invites, requiredSeats),
      window.location.origin,
    );
    if (sent.some((s) => !s.link)) toast.warning("Some invitations couldn't be created");
    setBusy(false);
    toast.success(`${parsed.name} created`);
    await qc.invalidateQueries();
    onCreated?.(id);
    if (!parentId) {
      setOpen(false);
      reset();
      return;
    }
    setCreated({ id, name: parsed.name, sent });
    setStepIdx(steps.length - 1);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {parentId ? "Add a chapter or region" : "Create an organization"}
          </DialogTitle>
          {steps.length > 2 && (
            <p className="text-sm text-muted-foreground">
              {step === "done"
                ? "Done"
                : `Step ${stepIdx + 1} of ${steps.length - 1}: ${STEP_TITLES[step]}`}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {step === "basics" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="org-name">Name</Label>
                <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-slug">Web address</Label>
                <Input
                  id="org-slug"
                  value={slug}
                  placeholder={slugify(name) || "my-association"}
                  onChange={(e) => setSlug(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as OrgType)}>
                  <SelectTrigger aria-label="Type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {step === "details" &&
            chapterFields.map((d) => (
              <div key={d.id} className="space-y-1">
                <Label>
                  {d.label}
                  {d.required ? " *" : ""}
                </Label>
                <AttributeValueInput
                  def={d}
                  value={details[d.id]}
                  onChange={(v) => setDetails({ ...details, [d.id]: v })}
                />
              </div>
            ))}

          {step === "admin" && (
            <div className="space-y-2">
              <Label htmlFor="admin-email">Who runs it? (optional)</Label>
              <Input
                id="admin-email"
                type="email"
                placeholder="name@example.org"
                value={invites.admin}
                onChange={(e) => setInvites({ ...invites, admin: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">
                They get an invitation to be its admin. Leave blank to run it yourself for now: you
                keep access from {parent?.name ?? "the parent organization"}.
              </p>
            </div>
          )}

          {step === "officers" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {parent?.name} requires these officers. Invite them now, or leave a seat blank to do
                it later. Once they've joined, appoint them on the chapter's Board tab; until then
                the seat shows as Vacant.
              </p>
              {requiredSeats.map((s) => (
                <div key={s.id} className="space-y-1">
                  <Label htmlFor={`seat-${s.id}`}>
                    {s.title}
                    {s.seat_count > 1 ? ` (${s.seat_count} seats)` : ""}
                  </Label>
                  <Input
                    id={`seat-${s.id}`}
                    type="email"
                    placeholder="Email (optional)"
                    value={invites.officers[s.id] ?? ""}
                    onChange={(e) =>
                      setInvites({
                        ...invites,
                        officers: { ...invites.officers, [s.id]: e.target.value },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          )}

          {step === "done" && created && (
            <div className="space-y-3">
              <p>
                <strong>{created.name}</strong> is ready.
                {requiredSeats.length > 0 &&
                  ` Its required seats (${requiredSeats.map((s) => s.title).join(", ")}) show as Vacant until you appoint officers.`}
              </p>
              {created.sent.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Send these invitation links (emails come later):
                  </p>
                  <ul className="space-y-2 text-sm">
                    {created.sent.map((s) => (
                      <li key={s.email} className="space-y-1">
                        <span>
                          {s.email} · {s.role === "org_admin" ? "admin" : "member"}
                          {s.forSeats.length ? ` (for ${s.forSeats.join(", ")})` : ""}
                        </span>
                        {s.link ? (
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={s.link}
                              aria-label={`Invitation for ${s.email}`}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                navigator.clipboard.writeText(s.link!);
                                toast.success("Copied");
                              }}
                            >
                              Copy
                            </Button>
                          </div>
                        ) : (
                          <p className="text-destructive">
                            Couldn't create this invitation. Try again from the Members tab.
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "done" && created ? (
            <Button asChild>
              <Link
                to="/orgs/$orgId"
                params={{ orgId: created.id }}
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Open {created.name}
              </Link>
            </Button>
          ) : (
            <>
              {stepIdx > 0 && (
                <Button variant="ghost" onClick={() => setStepIdx(stepIdx - 1)} disabled={busy}>
                  Back
                </Button>
              )}
              <Button onClick={next} disabled={busy || stepsLoading}>
                {busy ? "Creating…" : lastInput ? "Create" : "Next"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
