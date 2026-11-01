import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { hasNewOptions } from "./drafts";

describe("hasNewOptions", () => {
  it("flags orgs that applied an older version of the flow", () => {
    expect(hasNewOptions({ status: "applied", answers: {} }, 2)).toBe(true);
    expect(hasNewOptions({ status: "applied", answers: { _version: 1 } }, 2)).toBe(true);
  });
  it("is quiet when up to date, not applied yet, or never started", () => {
    expect(hasNewOptions({ status: "applied", answers: { _version: 2 } }, 2)).toBe(false);
    expect(hasNewOptions({ status: "in_progress", answers: {} }, 2)).toBe(false);
    expect(hasNewOptions(null, 2)).toBe(false);
  });
});
