import { describe, expect, it } from "vitest";
import { appOrigin, EMAIL_SETTINGS_PATH } from "./email.server";

describe("self-hosted email links", () => {
  it("uses APP_URL, then the request's origin", () => {
    expect(appOrigin({ APP_URL: "https://charter.example.org/" })).toBe(
      "https://charter.example.org",
    );
    expect(appOrigin({}, new Request("https://c.example.org/account"))).toBe(
      "https://c.example.org",
    );
  });
  it("points email choices at the account page", () => {
    expect(EMAIL_SETTINGS_PATH).toBe("/account#email");
  });
});
