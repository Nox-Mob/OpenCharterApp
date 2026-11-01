// @vitest-environment node
import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./secret-box";

const key = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));
const otherKey = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => 255 - i)));

describe("secret box", () => {
  it("round-trips and never stores the plaintext", async () => {
    const sealed = await sealSecret('{"secretKey":"sk_test_abc"}', key);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain("sk_test_abc");
    expect(await openSecret(sealed, key)).toBe('{"secretKey":"sk_test_abc"}');
  });
  it("uses a fresh IV each time", async () => {
    expect(await sealSecret("x", key)).not.toBe(await sealSecret("x", key));
  });
  it("fails with the wrong key or tampered ciphertext", async () => {
    const sealed = await sealSecret("secret", key);
    await expect(openSecret(sealed, otherKey)).rejects.toThrow("could not decrypt");
    const [v, iv, ct] = sealed.split(":");
    const flipped = `${v}:${iv}:${ct!.slice(0, -4)}AAAA`;
    await expect(openSecret(flipped, key)).rejects.toThrow("could not decrypt");
  });
  it("rejects a bad key", async () => {
    await expect(sealSecret("x", btoa("short"))).rejects.toThrow("32 bytes");
  });
});
