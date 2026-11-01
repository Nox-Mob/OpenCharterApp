// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  parseSignatureHeader,
  safeEqual,
  signStripePayload,
  verifyStripeSignature,
} from "./webhook";

const secret = "whsec_test_secret_1234567890";
const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
const now = 1_790_000_000;

describe("verifyStripeSignature", () => {
  it("accepts a correctly signed, recent payload", async () => {
    const header = await signStripePayload(body, secret, now - 10);
    expect(await verifyStripeSignature(body, header, secret, now)).toEqual({ ok: true });
  });
  it("accepts when any of several v1 signatures matches (secret rotation)", async () => {
    const good = await signStripePayload(body, secret, now);
    const header = `t=${now},v1=${"0".repeat(64)},${good.split(",")[1]}`;
    expect(await verifyStripeSignature(body, header, secret, now)).toEqual({ ok: true });
  });
  it("rejects a tampered body, a wrong secret, an old timestamp or a missing header", async () => {
    const header = await signStripePayload(body, secret, now);
    expect(await verifyStripeSignature(body + " ", header, secret, now)).toMatchObject({
      ok: false,
      reason: "signature mismatch",
    });
    expect(await verifyStripeSignature(body, header, "whsec_other_secret_123", now)).toMatchObject({
      ok: false,
    });
    expect(await verifyStripeSignature(body, header, secret, now + 301)).toMatchObject({
      ok: false,
      reason: "timestamp outside tolerance",
    });
    expect(await verifyStripeSignature(body, null, secret, now)).toMatchObject({
      ok: false,
      reason: "missing signature",
    });
    expect(await verifyStripeSignature(body, "garbage", secret, now)).toMatchObject({
      ok: false,
      reason: "malformed signature",
    });
  });
});

describe("helpers", () => {
  it("parses the header", () => {
    expect(parseSignatureHeader("t=12,v1=ab,v0=zz,v1=cd")).toEqual({
      timestamp: 12,
      signatures: ["ab", "cd"],
    });
    expect(parseSignatureHeader("v1=ab")).toBeNull();
  });
  it("compares in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});
