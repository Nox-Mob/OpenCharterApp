import { describe, expect, it } from "vitest";
import { describeEvent, groupEvents, toAuditEvent, type AuditEvent } from "./describe";
import { isSetupDraft } from "./queries";

const ev = (over: Partial<AuditEvent>): AuditEvent => ({
  id: 1,
  created_at: "2026-11-03T20:53:23Z",
  tx_id: null,
  actor_id: "u1",
  actor_name: "Demo-National",
  action: "update",
  target_type: "seat_templates",
  target_id: "t1",
  before: null,
  after: null,
  refs: {},
  ...over,
});

describe("describeEvent (D-191)", () => {
  it("says who modified which board seat, with the previous and current title", () => {
    const d = describeEvent(
      ev({
        before: { id: "t1", org_id: "o", title: "President", updated_at: "x" },
        after: { id: "t1", org_id: "o", title: "Emperor Elect", updated_at: "y" },
      }),
    );
    expect(`${d.who} ${d.what} · ${d.record}`).toBe(
      "Demo-National modified Board settings · Emperor Elect",
    );
    expect(d.changes).toEqual([
      { field: "Title", previous: "President", current: "Emperor Elect" },
    ]);
  });

  it("shows a chapter's first rename of an inherited seat against the seat's own title", () => {
    const d = describeEvent(
      ev({
        action: "insert",
        target_type: "seat_title_overrides",
        after: { template_id: "t1", title: "Commander" },
        refs: { template_id: "President" },
      }),
    );
    expect(d.what).toBe("modified Board settings");
    expect(d.record).toBe("President");
    expect(d.changes).toEqual([{ field: "Title", previous: "President", current: "Commander" }]);
  });

  it("uses the settings registry's labels and options", () => {
    const d = describeEvent(
      ev({
        target_type: "org_settings",
        before: { key: "membership.grace_days", value: 30, mode: "override" },
        after: { key: "membership.grace_days", value: 14, mode: "locked" },
      }),
    );
    expect(d.record).toBe("Grace period (days)");
    expect(d.changes).toEqual([
      { field: "Grace period (days)", previous: "30", current: "14" },
      { field: "For chapters", previous: "Chapters may change it", current: "Locked for chapters" },
    ]);
  });

  it("names referenced records, formats money and hides bookkeeping columns", () => {
    const d = describeEvent(
      ev({
        target_type: "tier_terms",
        action: "update",
        before: {
          label: "1 year",
          price_minor: 2500,
          currency: "USD",
          tier_id: "x",
          sort_order: 1,
        },
        after: { label: "1 year", price_minor: 3000, currency: "USD", tier_id: "x", sort_order: 2 },
        refs: { tier_id: "Regular" },
      }),
    );
    expect(d.what).toBe("modified Membership levels");
    expect(d.changes).toEqual([{ field: "Price", previous: "$25.00", current: "$30.00" }]);
  });

  it("describes appointments, roles, removals and system actions in plain words", () => {
    expect(
      describeEvent(
        ev({
          target_type: "appointments",
          action: "insert",
          after: { template_id: "t", profile_id: "p", starts_on: "2026-11-01" },
          refs: { template_id: "Treasurer", profile_id: "Morgan" },
        }),
      ),
    ).toMatchObject({ what: "appointed Morgan as", record: "Treasurer" });
    expect(
      describeEvent(
        ev({
          target_type: "role_assignments",
          action: "delete",
          before: { role_id: "r" },
          refs: { role_id: "Admin", user_id: "Chris" },
        }),
      ),
    ).toMatchObject({ what: "removed the Admin role from", record: "Chris" });
    const removed = describeEvent(
      ev({
        target_type: "org_member_profiles",
        action: "remove",
        after: { display_name: "Ann", reason: "Duplicate" },
      }),
    );
    expect(removed).toMatchObject({ what: "removed from the roster", record: "Ann" });
    expect(removed.changes).toEqual([{ field: "Reason", previous: "—", current: "Duplicate" }]);
    expect(describeEvent(ev({ actor_id: null, actor_name: null })).who).toBe("The system");
    expect(
      describeEvent(
        ev({
          target_type: "attribute_values",
          action: "update",
          before: { definition_id: "d", value: "Army" },
          after: { definition_id: "d", value: "Navy" },
          refs: { definition_id: "Branch" },
        }),
      ).record,
    ).toBe("Branch");
  });

  it("shows a removed record's reference as such", () => {
    const d = describeEvent(
      ev({
        target_type: "memberships",
        before: { tier_id: "11111111-1111-4111-8111-111111111111" },
        after: { tier_id: "22222222-2222-4222-8222-222222222222" },
        refs: { tier_id: "Gold" },
      }),
    );
    expect(d.changes).toEqual([{ field: "Level", previous: "Gold", current: "Gold" }]);
  });
});

describe("groupEvents", () => {
  it("shows one save as one entry, led by an applied setup", () => {
    const entries = groupEvents([
      ev({
        id: 3,
        tx_id: 9,
        target_type: "attribute_definitions",
        action: "insert",
        after: { label: "Rank" },
      }),
      ev({
        id: 2,
        tx_id: 9,
        target_type: "setup_states",
        action: "update",
        before: { status: "in_progress" },
        after: { flow_id: "membership", status: "applied", applied_at: "t" },
      }),
      ev({
        id: 1,
        tx_id: null,
        title: undefined,
        before: { title: "A" },
        after: { title: "B" },
      } as Partial<AuditEvent>),
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.what).toBe("applied Membership setup");
    expect(entries[0]!.more.map((m) => m.what)).toEqual(["added Member fields"]);
  });

  it("keeps different people's changes apart, and older events (no transaction) one by one", () => {
    const entries = groupEvents([
      ev({ id: 3, tx_id: 5, actor_id: "a" }),
      ev({ id: 2, tx_id: 5, actor_id: "b" }),
      ev({ id: 1, tx_id: null }),
      ev({ id: 0, tx_id: null }),
    ]);
    expect(entries).toHaveLength(4);
  });
});

describe("isSetupDraft and toAuditEvent", () => {
  it("hides drafts but keeps an applied setup", () => {
    expect(
      isSetupDraft({ target_type: "setup_states", before: null, after: { status: "in_progress" } }),
    ).toBe(true);
    expect(
      isSetupDraft({
        target_type: "setup_states",
        before: { status: "applied", applied_at: "a" },
        after: { status: "applied", applied_at: "a", answers: {} },
      }),
    ).toBe(true);
    expect(
      isSetupDraft({
        target_type: "setup_states",
        before: { applied_at: null },
        after: { status: "applied", applied_at: "b" },
      }),
    ).toBe(false);
    expect(isSetupDraft({ target_type: "seat_templates", before: null, after: null })).toBe(false);
  });

  it("reads database rows", () => {
    expect(
      toAuditEvent({
        id: 1,
        created_at: "x",
        actor_id: null,
        action: "insert",
        target_type: "t",
        target_id: null,
        after: { a: 1 },
        refs: null,
      }),
    ).toMatchObject({ tx_id: null, actor_name: null, before: null, after: { a: 1 }, refs: {} });
  });
});
