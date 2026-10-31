import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Org } from "@/lib/orgs";
import { PERMISSION_LABELS, PERMISSIONS, type Grant, type Permission } from "@/lib/policy";
import {
  grantablePermissions,
  roleErrorMessage,
  roleInputSchema,
  roleKey,
  validateNewRole,
  type Role,
  type RoleInput,
} from "@/modules/roles";
import { rolesQuery } from "@/modules/roles/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const EMPTY: RoleInput = { name: "", description: "", permissions: [] };

/** Roles tab (E-05): platform and inherited roles are read-only; this org's roles are editable. */
export function RolesTab({ org, orgs, grants }: { org: Org; orgs: Org[]; grants: Grant[] }) {
  const qc = useQueryClient();
  const { data: roles = [], isLoading } = useQuery(rolesQuery());
  const [editing, setEditing] = useState<{ role: Role | null; input: RoleInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const grantable = new Set<string>(grantablePermissions(grants, org));
  const lineage = [...org.ancestor_ids, org.id];
  const shown = roles
    .filter((r) => r.org_id === null || lineage.includes(r.org_id))
    .filter((r) => r.active || r.org_id === org.id)
    .sort(
      (x, y) =>
        (x.org_id === null ? -1 : lineage.indexOf(x.org_id)) -
          (y.org_id === null ? -1 : lineage.indexOf(y.org_id)) || x.name.localeCompare(y.name),
    );
  const source = (r: Role) =>
    r.org_id === null
      ? "Built in"
      : r.org_id === org.id
        ? "This organization"
        : `From ${orgs.find((o) => o.id === r.org_id)?.name ?? "a parent organization"}`;

  async function save() {
    if (!editing) return;
    const parsed = roleInputSchema.safeParse(editing.input);
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Check the form");
    const input = parsed.data;
    if (!editing.role) {
      const err = validateNewRole(
        input,
        roles.map((r) => r.key),
      );
      if (err) return void toast.error(err);
    }
    setBusy(true);
    const { error } = editing.role
      ? await supabase.rpc("update_role", {
          _role: editing.role.id,
          _name: input.name,
          _description: input.description,
          _perms: input.permissions,
        })
      : await supabase.rpc("create_role", {
          _org: org.id,
          _key: roleKey(input.name),
          _name: input.name,
          _description: input.description,
          _perms: input.permissions,
        });
    setBusy(false);
    if (error) return void toast.error(roleErrorMessage(error.message));
    toast.success("Role saved");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["roles"] });
    qc.invalidateQueries({ queryKey: ["grants"] });
  }

  async function toggleActive(r: Role) {
    const { error } = await supabase.rpc("set_role_active", { _role: r.id, _active: !r.active });
    if (error) return void toast.error(roleErrorMessage(error.message));
    toast.success(r.active ? "Role retired" : "Role restored");
    qc.invalidateQueries({ queryKey: ["roles"] });
  }

  function togglePerm(p: Permission, on: boolean) {
    if (!editing) return;
    const set = new Set(editing.input.permissions);
    if (on) set.add(p);
    else set.delete(p);
    setEditing({
      ...editing,
      input: { ...editing.input, permissions: PERMISSIONS.filter((x) => set.has(x)) },
    });
  }

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  const before = new Set(editing?.role?.permissions ?? []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground">
          Roles bundle permissions. Roles you create here also apply to your chapters. You can only
          include permissions you hold yourself.
        </p>
        <Button onClick={() => setEditing({ role: null, input: EMPTY })}>Add role</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Role</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead>Source</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r) => {
            const own = r.org_id === org.id;
            return (
              <TableRow key={r.id} className={r.active ? "" : "opacity-60"}>
                <TableCell className="font-medium">
                  {r.name}
                  {!r.active && (
                    <Badge variant="secondary" className="ml-2">
                      Retired
                    </Badge>
                  )}
                  {r.description && (
                    <p className="text-xs font-normal text-muted-foreground">{r.description}</p>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {r.permissions.length === 0
                    ? "No extra permissions"
                    : r.permissions.length === PERMISSIONS.length
                      ? "All permissions"
                      : r.permissions
                          .map((p) => PERMISSION_LABELS[p as Permission] ?? p)
                          .join(", ")}
                </TableCell>
                <TableCell>
                  {own ? source(r) : <Badge variant="secondary">{source(r)}</Badge>}
                </TableCell>
                <TableCell className="space-x-1 whitespace-nowrap text-right">
                  {own && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setEditing({
                            role: r,
                            input: {
                              name: r.name,
                              description: r.description,
                              permissions: r.permissions.filter((p): p is Permission =>
                                (PERMISSIONS as readonly string[]).includes(p),
                              ),
                            },
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(r)}>
                        {r.active ? "Retire" : "Restore"}
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="flex max-h-[90vh] max-w-xl flex-col gap-0 p-0">
          <DialogHeader className="border-b px-6 pb-4 pt-6">
            <DialogTitle>{editing?.role ? `Edit ${editing.role.name}` : "Add a role"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="role-name">Name</Label>
                <Input
                  id="role-name"
                  value={editing.input.name}
                  onChange={(e) =>
                    setEditing({ ...editing, input: { ...editing.input, name: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-description">Description</Label>
                <Textarea
                  id="role-description"
                  rows={2}
                  value={editing.input.description}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      input: { ...editing.input, description: e.target.value },
                    })
                  }
                />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Permissions</legend>
                {PERMISSIONS.map((p) => {
                  const checked = editing.input.permissions.includes(p);
                  // Removing is always allowed; adding needs the permission yourself.
                  const disabled = !grantable.has(p) && !(checked && before.has(p));
                  return (
                    <label key={p} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(c) => togglePerm(p, c === true)}
                        aria-label={PERMISSION_LABELS[p]}
                      />
                      <span className={disabled ? "text-muted-foreground" : ""}>
                        {PERMISSION_LABELS[p]}
                        {disabled && <span className="block text-xs">You don't hold this</span>}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            </div>
          )}
          <DialogFooter className="border-t px-6 py-4">
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
