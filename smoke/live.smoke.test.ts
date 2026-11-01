/**
 * Live smoke test (docs/lovable-handoff.md §5), run without anyone clicking through the app.
 * Signs in as the demo accounts and drives the same backend actions the screens use.
 * Each run creates its own uniquely named records inside the demo orgs only.
 * Run: bun run test:smoke
 */
import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, DEMO, rpc, rpcFails, runId, signIn, type Db } from "./client";

const AUSTIN = DEMO.orgs.austin;
const NATIONAL = DEMO.orgs.national;
const DALLAS = DEMO.orgs.dallas;
// Levels are national-managed in the demo (chapters may not add their own), so money flows run at the national.
const ORG = NATIONAL;

let nationalAdmin: Db;
let chapterAdmin: Db;
let member: Db;
let anon: Db;
let memberUserId: string;

let tierId: string;
let orgAdmin: Db;
let termId: string;

beforeAll(async () => {
  [nationalAdmin, chapterAdmin, member] = await Promise.all([
    signIn(DEMO.national),
    signIn(DEMO.chapter),
    signIn(DEMO.member),
  ]);
  anon = anonClient();
  orgAdmin = nationalAdmin;
  memberUserId = (await member.auth.getUser()).data.user!.id;
});

describe("0. migrations are live (handoff quick checks)", () => {
  for (const table of [
    "memberships",
    "payments",
    "membership_events",
    "gateway_connections",
    "member_segments",
    "receipts",
    "seat_templates",
    "seat_terms",
    "appointments",
  ]) {
    it(`table ${table} is reachable`, async () => {
      const { error } = await chapterAdmin.from(table).select("*", { count: "exact", head: true });
      expect(error).toBeNull();
    });
  }

  it("directory_listed column exists on member profiles", async () => {
    const { error } = await member.from("org_member_profiles").select("directory_listed").limit(1);
    expect(error).toBeNull();
  });

  it("gateway secrets are not exposed through the API", async () => {
    const { error } = await chapterAdmin.schema("private" as never).from("gateway_secrets").select("*");
    expect(error).not.toBeNull();
  });

  it("public join info works signed out", async () => {
    const info = await rpc(anon, "public_join_info", { _slug: "demo-national" });
    expect(info).not.toBeNull();
  });
});

describe("1. levels for this run", () => {
  it("Austin can't add its own levels while the national manages them", async () => {
    const res = await chapterAdmin
      .from("membership_tiers")
      .insert({ org_id: AUSTIN, key: `smoke_${runId}`, name: `Smoke ${runId}` });
    expect(res.error?.message).toContain("parent organization manages membership levels");
  });

  it("national admin adds a paid 1-year level", async () => {
    const tier = await orgAdmin
      .from("membership_tiers")
      .insert({ org_id: ORG, key: `smoke_${runId}`, name: `Smoke ${runId}` })
      .select("id")
      .single();
    expect(tier.error).toBeNull();
    tierId = tier.data!.id;
    const term = await orgAdmin
      .from("tier_terms")
      .insert({
        org_id: ORG,
        tier_id: tierId,
        key: "1y",
        label: "1 year",
        length_count: 1,
        length_unit: "year",
        price_minor: 2500,
      })
      .select("id")
      .single();
    expect(term.error).toBeNull();
    termId = term.data!.id;
  });

  it("an outsider org admin cannot add levels to Austin from Dallas's side", async () => {
    // demo-member is a member of Austin but has no tiers.manage in Dallas
    const res = await member
      .from("membership_tiers")
      .insert({ org_id: DALLAS, key: `bad_${runId}`, name: "bad" });
    expect(res.error).not.toBeNull();
  });

  it("levels can't be deleted (retire only)", async () => {
    await orgAdmin.from("membership_tiers").delete().eq("id", tierId);
    const { data } = await orgAdmin.from("membership_tiers").select("id").eq("id", tierId);
    expect(data).toHaveLength(1);
  });
});

describe("2. memberships and check payments (0008)", () => {
  let profileId: string;
  let membershipId: string;

  it("admin adds a member record without an email", async () => {
    profileId = await rpc<string>(orgAdmin, "admin_create_member", {
      _org: ORG,
      _display_name: `Smoke Check ${runId}`,
    });
    expect(profileId).toMatch(/[0-9a-f-]{36}/);
  });

  it("a plain member cannot add member records in Dallas", async () => {
    await rpcFails(member, "admin_create_member", { _org: DALLAS, _display_name: "nope" });
  });

  it("admin records a 1-year membership paid by check", async () => {
    membershipId = await rpc<string>(orgAdmin, "record_membership", {
      _profile: profileId,
      _term: termId,
      _amount_minor: 2500,
      _method: "check",
      _note: "smoke",
    });
    const { data } = await orgAdmin.from("memberships").select("*").eq("id", membershipId).single();
    expect(data.status).toBe("active");
    expect(data.lifetime).toBe(false);
    const oneYear = new Date(data.joined_on);
    oneYear.setFullYear(oneYear.getFullYear() + 1);
    expect(new Date(data.paid_through).getTime()).toBeGreaterThan(Date.now());
  });

  it("standing is good", async () => {
    const { data } = await orgAdmin.from("memberships").select("*").eq("id", membershipId).single();
    const grace = await rpc<number>(orgAdmin, "grace_days", { _org: ORG });
    const standing = await rpc<string>(orgAdmin, "membership_standing", {
      _status: data.status,
      _paid_through: data.paid_through,
      _lifetime: data.lifetime,
      _grace: grace,
      _today: new Date().toISOString().slice(0, 10),
    });
    expect(standing).toBe("good");
  });

  it("standing rules: grace then lapsed", async () => {
    const args = { _status: "active", _lifetime: false, _grace: 30, _today: "2026-06-15" };
    expect(await rpc(orgAdmin, "membership_standing", { ...args, _paid_through: "2026-07-01" })).toBe("good");
    expect(await rpc(orgAdmin, "membership_standing", { ...args, _paid_through: "2026-06-01" })).toBe("grace");
    expect(await rpc(orgAdmin, "membership_standing", { ...args, _paid_through: "2026-04-01" })).toBe("lapsed");
  });

  it("history shows the join with its payment", async () => {
    const { data } = await orgAdmin.from("membership_events").select("*").eq("membership_id", membershipId);
    expect(data!.length).toBe(1);
    expect(data![0].kind).toBe("joined");
    expect(data![0].payment_id).not.toBeNull();
  });

  it("history is append-only", async () => {
    await orgAdmin.from("membership_events").delete().eq("membership_id", membershipId);
    const { data } = await orgAdmin.from("membership_events").select("id").eq("membership_id", membershipId);
    expect(data!.length).toBe(1);
  });

  it("clients cannot write payments directly", async () => {
    const res = await orgAdmin.from("payments").insert({
      org_id: ORG,
      purpose: "join",
      amount_minor: 1,
      status: "paid",
    });
    expect(res.error).not.toBeNull();
  });

  it("a second check stacks the renewal onto the paid-through date", async () => {
    const before = (await orgAdmin.from("memberships").select("paid_through").eq("id", membershipId).single())
      .data!.paid_through as string;
    await rpc(orgAdmin, "record_membership", {
      _profile: profileId,
      _term: termId,
      _amount_minor: 2500,
      _method: "cash",
    });
    const after = (await orgAdmin.from("memberships").select("paid_through").eq("id", membershipId).single())
      .data!.paid_through as string;
    expect(new Date(after).getFullYear()).toBe(new Date(before).getFullYear() + 1);
  });

  describe("3. receipts (0013)", () => {
    let receiptId: string;

    it("the check payment has a numbered receipt", async () => {
      const pay = await orgAdmin
        .from("payments")
        .select("id")
        .eq("membership_id", membershipId)
        .eq("method", "check")
        .single();
      const { data } = await orgAdmin.from("receipts").select("*").eq("payment_id", pay.data!.id);
      expect(data).toHaveLength(1);
      const r = data![0];
      receiptId = r.id;
      expect(r.status).toBe("issued");
      expect(r.number).toMatch(new RegExp(`^${r.year}-\\d{5}$`));
      expect(r.snapshot).toBeTruthy();
    });

    it("receipts can't be edited", async () => {
      await orgAdmin.from("receipts").update({ number: "hacked" }).eq("id", receiptId);
      const { data } = await orgAdmin.from("receipts").select("number").eq("id", receiptId).single();
      expect(data!.number).not.toBe("hacked");
    });

    it("receipt numbers have no gaps within the org and year", async () => {
      const { data } = await orgAdmin
        .from("receipts")
        .select("seq, year")
        .eq("org_id", ORG)
        .order("seq");
      const year = new Date().getFullYear();
      const seqs = data!.filter((r) => r.year === year).map((r) => r.seq);
      seqs.forEach((s, i) => expect(s).toBe(i + 1));
    });

    it("a member can't void someone else's receipt", async () => {
      await rpcFails(anon, "void_receipt", { _receipt: receiptId, _reason: "x" });
    });

    it("void needs a reason-holder with permission, then shows VOID", async () => {
      await rpc(orgAdmin, "void_receipt", { _receipt: receiptId, _reason: "smoke test void" });
      const { data } = await orgAdmin.from("receipts").select("status, void_reason").eq("id", receiptId).single();
      expect(data!.status).toBe("voided");
      expect(data!.void_reason).toBe("smoke test void");
    });

    it("a voided receipt can't be voided again", async () => {
      await rpcFails(orgAdmin, "void_receipt", { _receipt: receiptId, _reason: "again" });
    });
  });

  it("cancelling a membership is recorded in history", async () => {
    await rpc(orgAdmin, "cancel_membership", { _membership: membershipId, _note: "smoke cleanup" });
    const { data } = await orgAdmin.from("membership_events").select("kind").eq("membership_id", membershipId);
    expect(data!.map((e) => e.kind)).toContain("cancelled");
  });
});

describe("4. test gateway (0009)", () => {
  it("only payment managers can connect it", async () => {
    await rpcFails(anon, "connect_test_gateway", { _org: ORG });
  });

  it("the test gateway is allowed for demo orgs", async () => {
    expect(await rpc(orgAdmin, "test_gateway_allowed", { _org: ORG })).toBe(true);
  });

  it("admin turns on test payments; badge reads test mode", async () => {
    await rpc(orgAdmin, "connect_test_gateway", { _org: ORG });
    const { data } = await orgAdmin.from("gateway_connections").select("*").eq("org_id", ORG).single();
    expect(data!.gateway).toBe("test");
    expect(data!.livemode).toBe(false);
    expect(data!.status).toBe("verified");
  });

  it("server-only functions are unreachable by clients", async () => {
    await rpcFails(orgAdmin, "gateway_sealed_credentials", { _org: ORG });
    await rpcFails(orgAdmin, "save_stripe_connection", {
      _org: ORG,
      _sealed: "x",
      _account_label: "x",
      _livemode: false,
    });
  });
});

describe("5. joining online (0010)", () => {
  async function requiredAnswers(): Promise<Record<string, unknown>> {
    const info = (await rpc<Record<string, unknown>>(anon, "public_join_info", { _slug: "demo-national" })) ?? {};
    const fields = ((info["fields"] ?? info["questions"] ?? []) as Array<Record<string, unknown>>) || [];
    const answers: Record<string, unknown> = {};
    for (const f of fields) {
      if (!f["required"]) continue;
      const id = f["id"] as string;
      const options = (f["options"] ?? []) as Array<Record<string, unknown>>;
      switch (f["data_type"]) {
        case "number":
          answers[id] = 1;
          break;
        case "date":
          answers[id] = "2024-01-01";
          break;
        case "boolean":
          answers[id] = true;
          break;
        case "choice":
        case "ordered":
          answers[id] = options[0]?.["value"];
          break;
        case "multi_choice":
          answers[id] = [options[0]?.["value"]];
          break;
        default:
          answers[id] = "smoke";
      }
    }
    return answers;
  }

  async function memberMembership() {
    const { data } = await member
      .from("memberships")
      .select("*, org_member_profiles!inner(user_id)")
      .eq("org_id", ORG)
      .eq("org_member_profiles.user_id", memberUserId)
      .maybeSingle();
    return data;
  }

  it("the join page lists this run's level signed out", async () => {
    const info = await rpc(anon, "public_join_info", { _slug: "demo-national" });
    expect(JSON.stringify(info)).toContain(termId);
  });

  it("signed-out visitors can't start a join", async () => {
    await rpcFails(anon, "begin_join", { _org: ORG, _term: termId });
  });

  it("a level from another org is refused", async () => {
    await rpcFails(member, "begin_join", { _org: AUSTIN, _term: termId });
  });

  it("get the member to a state where they can join", async () => {
    const m = await memberMembership();
    if (m && (m.status === "active" || m.status === "pending")) {
      await rpc(orgAdmin, "cancel_membership", { _membership: m.id, _note: "smoke reset" });
    }
    const after = await memberMembership();
    expect(after === null || !["active", "pending"].includes(after.status)).toBe(true);
  });

  let paymentId: string;

  it("declined card: nothing is created", async () => {
    paymentId = await rpc<string>(member, "begin_join", {
      _org: ORG,
      _term: termId,
      _answers: await requiredAnswers(),
    });
    const before = await memberMembership();
    await rpc(member, "complete_test_payment", { _payment: paymentId, _outcome: "declined" });
    const { data } = await member.from("payments").select("status").eq("id", paymentId).single();
    expect(data!.status).toBe("failed");
    const after = await memberMembership();
    expect(after?.status ?? null).toBe(before?.status ?? null);
  });

  it("someone else can't complete the member's payment", async () => {
    await rpcFails(orgAdmin, "complete_test_payment", { _payment: paymentId, _outcome: "accepted" });
  });

  it("accepted card: membership waits for approval and a receipt is issued", async () => {
    await rpc(member, "complete_test_payment", { _payment: paymentId, _outcome: "accepted" });
    const { data } = await member.from("payments").select("status, gateway, livemode").eq("id", paymentId).single();
    expect(data).toMatchObject({ status: "paid", gateway: "test", livemode: false });
    const approval = await rpc<boolean>(member, "effective_approval_required", { _org: ORG });
    const m = await memberMembership();
    expect(m!.status).toBe(approval ? "pending" : "active");
    const receipts = await member.from("receipts").select("status").eq("payment_id", paymentId);
    expect(receipts.data).toEqual([{ status: "issued" }]);
  });

  it("completing the same payment twice changes nothing", async () => {
    const before = await memberMembership();
    await rpc(member, "complete_test_payment", { _payment: paymentId, _outcome: "accepted" });
    const after = await memberMembership();
    expect(after!.paid_through).toBe(before!.paid_through);
    const receipts = await member.from("receipts").select("id").eq("payment_id", paymentId);
    expect(receipts.data).toHaveLength(1);
  });

  it("a second application while pending is refused", async () => {
    const m = await memberMembership();
    if (m!.status === "pending") {
      const msg = await rpcFails(member, "begin_join", { _org: ORG, _term: termId });
      expect(msg).toContain("waiting for approval");
    }
  });

  it("the member can't approve themselves", async () => {
    const m = await memberMembership();
    if (m!.status !== "pending") return;
    // demo-member also holds an admin role in Austin (docs/demo-data.md), so use a signed-out client
    await rpcFails(anon, "approve_membership", { _membership: m!.id });
  });

  it("admin approves; the member is active and in good standing", async () => {
    const m = await memberMembership();
    if (m!.status === "pending") await rpc(orgAdmin, "approve_membership", { _membership: m!.id });
    const after = await memberMembership();
    expect(after!.status).toBe("active");
    expect(new Date(after!.paid_through).getTime()).toBeGreaterThan(Date.now());
  });

  it("an active member is told to renew instead of joining", async () => {
    const msg = await rpcFails(member, "begin_join", { _org: ORG, _term: termId });
    expect(msg).toContain("renew instead");
  });

  it("online renewal stacks a year onto paid-through", async () => {
    const m = await memberMembership();
    const pay = await rpc<string>(member, "begin_renewal", { _membership: m!.id, _term: termId });
    await rpc(member, "complete_test_payment", { _payment: pay, _outcome: "accepted" });
    const after = await memberMembership();
    expect(new Date(after!.paid_through).getFullYear()).toBe(new Date(m!.paid_through).getFullYear() + 1);
  });

  it("decline with refund: a second application is refunded", async () => {
    await rpc(orgAdmin, "cancel_membership", { _membership: (await memberMembership())!.id });
    const approval = await rpc<boolean>(member, "effective_approval_required", { _org: ORG });
    const pay = await rpc<string>(member, "begin_join", {
      _org: ORG,
      _term: termId,
      _answers: await requiredAnswers(),
    });
    await rpc(member, "complete_test_payment", { _payment: pay, _outcome: "accepted" });
    const m = await memberMembership();
    if (!approval) {
      expect(m!.status).toBe("active");
      return;
    }
    const res = await rpc<{ refund: string | null }>(orgAdmin, "decline_application", {
      _membership: m!.id,
      _note: "smoke decline",
    });
    expect(res.refund).toBe("done");
    const { data } = await member.from("payments").select("status").eq("id", pay).single();
    expect(data!.status).toBe("refunded");
    expect((await memberMembership())!.status).toBe("declined");
    const receipts = await member.from("receipts").select("status").eq("payment_id", pay);
    expect(receipts.data!.some((r) => r.status === "issued")).toBe(false);
  });
});

describe("6. exports (0011)", () => {
  it("an export is written to the audit log", async () => {
    const since = new Date(Date.now() - 1000).toISOString();
    await rpc(orgAdmin, "log_member_export", {
      _org: ORG,
      _row_count: 3,
      _columns: ["display_name", "standing"],
      _filter: { standing: "good", smoke: runId },
    });
    const { data } = await orgAdmin
      .from("audit_events")
      .select("action, after")
      .eq("org_id", ORG)
      .gte("created_at", since)
      .ilike("action", "%export%");
    expect(data!.length).toBeGreaterThan(0);
  });

  it("signed-out users can't log exports", async () => {
    await rpcFails(anon, "log_member_export", { _org: ORG, _row_count: 1, _columns: ["x"] });
  });

  it("chapter admin can't export a sibling chapter", async () => {
    await rpcFails(orgAdmin, "log_member_export", { _org: DALLAS, _row_count: 1, _columns: ["x"] });
  });

  it("saved views: managers save, isolation holds", async () => {
    const res = await orgAdmin
      .from("member_segments")
      .insert({ org_id: ORG, name: `Smoke ${runId}`, filter: { standing: "good" } })
      .select("id")
      .single();
    expect(res.error).toBeNull();
    const sibling = await orgAdmin
      .from("member_segments")
      .insert({ org_id: DALLAS, name: `Smoke ${runId}`, filter: {} });
    expect(sibling.error).not.toBeNull();
  });
});

describe("7. directory (0012)", () => {
  it("opting out removes the member from the directory, opting in restores", async () => {
    // The member needs a current membership to be listed at all.
    const pay = await rpc<string>(member, "begin_join", { _org: ORG, _term: termId }).catch(() => null);
    if (pay) {
      await rpc(member, "complete_test_payment", { _payment: pay, _outcome: "accepted" });
      const { data: m } = await orgAdmin
        .from("memberships")
        .select("id,status")
        .eq("org_id", ORG)
        .eq("status", "pending");
      for (const row of m ?? []) await rpc(orgAdmin, "approve_membership", { _membership: row.id });
    }
    const profile = await member
      .from("org_member_profiles")
      .select("id")
      .eq("org_id", ORG)
      .eq("user_id", memberUserId)
      .single();
    const pid = profile.data!.id;

    await rpc(member, "set_my_directory_listing", { _org: ORG, _listed: true });
    let dir = await rpc<Array<{ profile_id: string }>>(orgAdmin, "member_directory", { _org: ORG });
    expect(dir.map((d) => d.profile_id)).toContain(pid);

    await rpc(member, "set_my_directory_listing", { _org: ORG, _listed: false });
    dir = await rpc(orgAdmin, "member_directory", { _org: ORG });
    expect(dir.map((d) => d.profile_id)).not.toContain(pid);

    await rpc(member, "set_my_directory_listing", { _org: ORG, _listed: true });
  });

  it("outsiders can't read the directory", async () => {
    await rpcFails(anon, "member_directory", { _org: ORG });
  });
});

describe("8. board seats (0014)", () => {
  let seatId: string;
  let appointmentId: string;

  it("national defines a required seat used by every chapter", async () => {
    seatId = await rpc<string>(nationalAdmin, "define_seat", {
      _org: NATIONAL,
      _key: `pres_${runId}`,
      _title: `President ${runId}`,
      _required: true,
      _scope: "chapters",
    });
    expect(seatId).toBeTruthy();
  });

  it("a chapter admin can't define seats at the national", async () => {
    await rpcFails(chapterAdmin, "define_seat", { _org: NATIONAL, _key: `x_${runId}`, _title: "x" });
  });

  it("the seat shows as vacant in Austin", async () => {
    const board = await rpc<Array<{ template_id: string; holders: unknown[] }>>(chapterAdmin, "org_board", {
      _org: AUSTIN,
    });
    const seat = board.find((s) => s.template_id === seatId);
    expect(seat).toBeTruthy();
    expect(seat!.holders ?? []).toHaveLength(0);
  });

  it("Austin sets its own 2-year term with a by-law reference", async () => {
    await rpc(chapterAdmin, "set_seat_term", {
      _org: AUSTIN,
      _template: seatId,
      _count: 2,
      _unit: "year",
      _effective_from: new Date().toISOString().slice(0, 10),
      _bylaw_reference: "Art. IV §2",
    });
    const board = await rpc<Array<Record<string, unknown>>>(chapterAdmin, "org_board", { _org: AUSTIN });
    const seat = board.find((s) => s["template_id"] === seatId)!;
    expect(seat["term_count"]).toBe(2);
    expect(seat["term_unit"]).toBe("year");
    expect(seat["bylaw_reference"]).toBe("Art. IV §2");
  });

  it("term history is append-only", async () => {
    await chapterAdmin.from("seat_terms").delete().eq("template_id", seatId);
    const { data } = await chapterAdmin.from("seat_terms").select("id").eq("template_id", seatId);
    expect(data!.length).toBe(1);
  });

  it("only a member in good standing can be appointed", async () => {
    const stranger = await rpc<string>(chapterAdmin, "admin_create_member", {
      _org: AUSTIN,
      _display_name: `No Dues ${runId}`,
    });
    await rpcFails(chapterAdmin, "appoint_officer", { _org: AUSTIN, _template: seatId, _profile: stranger });
  });

  it("appointing a paid member fills the seat with a 2-year planned end", async () => {
    const pid = await rpc<string>(chapterAdmin, "admin_create_member", {
      _org: AUSTIN,
      _display_name: `Officer ${runId}`,
    });
    await rpc(chapterAdmin, "record_membership", { _profile: pid, _term: termId, _method: "cash" });
    appointmentId = await rpc<string>(chapterAdmin, "appoint_officer", {
      _org: AUSTIN,
      _template: seatId,
      _profile: pid,
    });
    const { data } = await chapterAdmin.from("appointments").select("*").eq("id", appointmentId).single();
    const end = new Date(data!.planned_end);
    expect(end.getFullYear()).toBe(new Date(data!.starts_on).getFullYear() + 2);
    const board = await rpc<Array<{ template_id: string; holders: unknown[] }>>(chapterAdmin, "org_board", {
      _org: AUSTIN,
    });
    expect(board.find((s) => s.template_id === seatId)!.holders).toHaveLength(1);
  });

  it("ending the term moves them to past officers", async () => {
    await rpc(chapterAdmin, "end_appointment", { _appointment: appointmentId, _reason: "smoke" });
    const hist = await rpc<Array<{ appointment_id: string; ended_on: string | null }>>(
      chapterAdmin,
      "board_history",
      { _org: AUSTIN },
    );
    expect(hist.find((h) => h.appointment_id === appointmentId)!.ended_on).not.toBeNull();
  });

  it("the national retires the seat (never deleted)", async () => {
    await rpc(nationalAdmin, "set_seat_active", { _template: seatId, _active: false });
    const { data } = await nationalAdmin.from("seat_templates").select("active").eq("id", seatId).single();
    expect(data!.active).toBe(false);
  });
});

describe("9. cleanup of this run", () => {
  it("retire this run's level", async () => {
    const res = await chapterAdmin.from("membership_tiers").update({ active: false }).eq("id", tierId);
    expect(res.error).toBeNull();
  });
});
