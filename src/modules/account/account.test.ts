import { describe, expect, it } from "vitest";
import { accountErrorMessage, emailSchema, nameSchema, passwordSchema } from "./index";

describe("account rules (U4)", () => {
  it("checks names, emails and matching passwords", () => {
    expect(nameSchema.safeParse("  ").success).toBe(false);
    expect(nameSchema.parse("  Nora  ")).toBe("Nora");
    expect(emailSchema.parse(" Nora@Example.ORG ")).toBe("nora@example.org");
    expect(emailSchema.safeParse("nope").success).toBe(false);
    expect(passwordSchema.safeParse({ password: "short", confirm: "short" }).success).toBe(false);
    const mismatch = passwordSchema.safeParse({ password: "long enough", confirm: "different!" });
    expect(mismatch.success ? "" : mismatch.error.issues[0]?.message).toBe(
      "The passwords don't match",
    );
    expect(
      passwordSchema.safeParse({ password: "long enough", confirm: "long enough" }).success,
    ).toBe(true);
  });

  it("explains sign-in errors in plain words", () => {
    expect(accountErrorMessage("New password should be different from the old password.")).toBe(
      "Choose a password different from your current one.",
    );
    expect(accountErrorMessage("A user with this email address has already been registered")).toBe(
      "Another account already uses that email.",
    );
    expect(accountErrorMessage("Password is known to be weak and easy to guess")).toBe(
      "That password is too easy to guess.",
    );
    expect(accountErrorMessage("boom")).toBe("That didn't work. Please try again.");
  });
});
