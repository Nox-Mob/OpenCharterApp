import { describe, expect, it } from "vitest";
import { notificationSettingsHref } from "./notifications";

describe("notification settings link", () => {
  it("goes to OpenAppHub's account page when hosted, this app's own when self-hosted", () => {
    const hub = (p: string) => `https://openapphub.org${p}`;
    expect(notificationSettingsHref(true, hub)).toBe(
      "https://openapphub.org/account#notifications",
    );
    expect(notificationSettingsHref(false, hub)).toBe("/account#notifications");
  });
});
