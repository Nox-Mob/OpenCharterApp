import { describe, expect, it } from "vitest";
import { inviteSchema, inviteStatus, inviteUrl, safeRedirect } from "./index";

const now = new Date("2026-10-30T12:00:00Z");

describe("inviteStatus", () => {
  it("is pending before expiry", () => {
    expect(
      inviteStatus(
        { accepted_at: null, revoked_at: null, expires_at: "2026-11-13T12:00:00Z" },
        now,
      ),
    ).toBe("pending");
  });
  it("is expired at or after expiry", () => {
    expect(
      inviteStatus(
        { accepted_at: null, revoked_at: null, expires_at: "2026-10-30T12:00:00Z" },
        now,
      ),
    ).toBe("expired");
  });
  it("accepted wins over expired (single use)", () => {
    expect(
      inviteStatus({ accepted_at: "2026-10-01", revoked_at: null, expires_at: "2026-10-02" }, now),
    ).toBe("accepted");
  });
  it("revoked invitations are not usable", () => {
    expect(
      inviteStatus({ accepted_at: null, revoked_at: "2026-10-29", expires_at: "2026-11-13" }, now),
    ).toBe("revoked");
  });
});

describe("inviteSchema", () => {
  it("normalizes email case", () => {
    expect(inviteSchema.parse({ email: " Pat@Example.ORG ", role: "member" }).email).toBe(
      "pat@example.org",
    );
  });
  it("rejects malformed role keys (custom role keys are checked by the database)", () => {
    expect(inviteSchema.safeParse({ email: "a@b.co", role: "Owner!" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "a@b.co", role: "treasurer" }).success).toBe(true);
  });
});

describe("safeRedirect", () => {
  it("keeps same-origin paths", () => expect(safeRedirect("/invite/abc")).toBe("/invite/abc"));
  it("blocks protocol-relative URLs", () => expect(safeRedirect("//evil.com")).toBe("/dashboard"));
  it("blocks absolute URLs", () => expect(safeRedirect("https://evil.com")).toBe("/dashboard"));
});

it("builds the invite link", () => {
  expect(inviteUrl("https://x.app", "tok")).toBe("https://x.app/invite/tok");
});
