import { describe, expect, it } from "vitest";
import { pruneAnswers, visibleQuestions, visibleSteps, type FlowContext } from "@/engines/setup";
import {
  boardFlow,
  newSeat,
  SEAT_PRESETS,
  seatAnswersError,
  seatsUsedHere,
  termKeyOf,
  type SeatAnswer,
} from "./setup-flow";

const national: FlowContext = {
  orgType: "national",
  orgName: "Nat",
  board: { extraSeatsAllowed: true, inherited: [] },
};
const chapter = (extraSeatsAllowed: boolean): FlowContext => ({
  orgType: "chapter",
  orgName: "Chapter A",
  board: {
    extraSeatsAllowed,
    inherited: [
      {
        owner_org_id: "nat",
        key: "president",
        title: "President",
        term: { count: 2, unit: "year" },
      },
    ],
  },
});
const president: SeatAnswer = { ...SEAT_PRESETS[0]!, scope: "chapters" };

describe("board setup flow", () => {
  it("shows seats, rules and terms; chapter rules only to parents", () => {
    const a = boardFlow.defaults(national);
    expect(visibleSteps(boardFlow, a, national).map((s) => s.id)).toEqual([
      "seats",
      "rules",
      "terms",
    ]);
    const rules = boardFlow.steps.find((s) => s.id === "rules")!;
    expect(visibleQuestions(rules, a, national).map((q) => q.id)).toContain(
      "custom_titles_allowed",
    );
    expect(visibleQuestions(rules, a, chapter(true)).map((q) => q.id)).toEqual([
      "officers_good_standing",
    ]);
  });

  it("skips the seats step when the parent manages seats", () => {
    const ctx = chapter(false);
    const steps = visibleSteps(boardFlow, boardFlow.defaults(ctx), ctx).map((s) => s.id);
    expect(steps).toEqual(["rules", "terms"]);
    const plan = boardFlow.plan(pruneAnswers(boardFlow, { seats: [president] }, ctx), ctx);
    expect(plan.seats).toBeUndefined();
  });

  it("plans seats, own terms and locked parent rules", () => {
    const a = {
      ...boardFlow.defaults(national),
      seats: [president, newSeat("Treasurer", "self")],
      seat_terms: {
        [termKeyOf("nat", "treasurer")]: {
          term: { count: 3, unit: "year" as const },
          effective_from: "2026-01-01",
          bylaw_reference: " Art. II ",
        },
      },
      lock_good_standing: true,
      chapter_extra_seats_allowed: false,
    };
    const plan = boardFlow.plan(a, national);
    expect(plan.seats?.map((s) => [s.key, s.scope, s.term_count, s.sort_order])).toEqual([
      ["president", "chapters", 1, 10],
      ["treasurer", "self", 1, 20],
    ]);
    expect(plan.seat_terms).toEqual([
      {
        owner_org_id: "nat",
        key: "treasurer",
        length_count: 3,
        length_unit: "year",
        effective_from: "2026-01-01",
        bylaw_reference: "Art. II",
      },
    ]);
    expect(plan.settings).toEqual([
      { key: "governance.officers_good_standing", value: true, mode: "locked" },
      { key: "governance.custom_titles_allowed", value: true, mode: "locked" },
      { key: "governance.chapter_extra_seats_allowed", value: false, mode: "locked" },
    ]);
  });

  it("a chapter's seats are always its own", () => {
    const ctx = chapter(true);
    const plan = boardFlow.plan({ ...boardFlow.defaults(ctx), seats: [president] }, ctx);
    expect(plan.seats?.[0]?.scope).toBe("self");
    expect(plan.settings).toHaveLength(1);
  });

  it("lists the seats used here for the terms step", () => {
    const ctx = chapter(true);
    const used = seatsUsedHere({ seats: [newSeat("Chaplain", "self")] }, ctx, "a");
    expect(used.map((s) => `${s.owner_org_id}:${s.key}`)).toEqual(["nat:president", "a:chaplain"]);
    // a national's chapter seats aren't used at the national itself
    expect(seatsUsedHere({ seats: [president] }, national, "nat")).toEqual([]);
  });

  it("summarizes in plain language", () => {
    const ctx = chapter(true);
    const lines = boardFlow.summarize(
      {
        ...boardFlow.defaults(ctx),
        seat_terms: {
          "nat:president": {
            term: { count: 1, unit: "year" },
            effective_from: "2026-01-01",
            bylaw_reference: "§4",
          },
        },
      },
      ctx,
    );
    expect(lines).toContain("President term here: 1 year from 2026-01-01 (§4)");
    expect(lines).toContain("Officers must be members in good standing");
  });

  it("validates seat lists", () => {
    expect(seatAnswersError([president])).toBeNull();
    expect(seatAnswersError([{ ...president, title: " " }])).toBe("Give every seat a title");
    expect(seatAnswersError([president, president])).toBe("Two seats are called President");
    expect(seatAnswersError([{ ...president, seat_count: 0 }])).toMatch(/1 to 50/);
  });
});
