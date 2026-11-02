import { describe, expect, it } from "vitest";
import { plannedInvites, wizardInvitesSchema, wizardSteps } from "./creation";

describe("wizardSteps", () => {
  it("top-level orgs are one step", () => {
    expect(
      wizardSteps({ isChild: false, type: "national", hasFields: true, requiredSeats: 3 }),
    ).toEqual(["basics", "done"]);
  });
  it("chapters get details and officers only when there are any", () => {
    expect(
      wizardSteps({ isChild: true, type: "chapter", hasFields: true, requiredSeats: 2 }),
    ).toEqual(["basics", "details", "admin", "officers", "done"]);
    expect(
      wizardSteps({ isChild: true, type: "chapter", hasFields: false, requiredSeats: 0 }),
    ).toEqual(["basics", "admin", "done"]);
  });
  it("regions skip chapter details and officers", () => {
    expect(
      wizardSteps({ isChild: true, type: "region", hasFields: true, requiredSeats: 2 }),
    ).toEqual(["basics", "admin", "done"]);
  });
});

describe("plannedInvites", () => {
  const seats = [
    { id: "s1", title: "President" },
    { id: "s2", title: "Treasurer" },
    { id: "s3", title: "Secretary" },
  ];
  it("one invitation per email; the admin gets the admin role", () => {
    expect(
      plannedInvites(
        {
          admin: " Pat@Example.org ",
          officers: { s1: "pat@example.org", s2: "sam@example.org", s3: "" },
        },
        seats,
      ),
    ).toEqual([
      { email: "pat@example.org", role: "org_admin", forSeats: ["President"] },
      { email: "sam@example.org", role: "member", forSeats: ["Treasurer"] },
    ]);
  });
  it("nothing to send when everything is blank", () => {
    expect(plannedInvites({ admin: "", officers: {} }, seats)).toEqual([]);
  });
  it("checks emails", () => {
    expect(wizardInvitesSchema.safeParse({ admin: "nope", officers: {} }).success).toBe(false);
    expect(wizardInvitesSchema.safeParse({ admin: "", officers: { s1: "a@b.org" } }).success).toBe(
      true,
    );
  });
});
