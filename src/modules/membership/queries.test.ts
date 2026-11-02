import { describe, expect, it } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { tierErrorMessage } from "./queries";

describe("tierErrorMessage", () => {
  it("explains the national's price range for chapter dues (D-146)", () => {
    expect(
      tierErrorMessage("chapter dues must be between 10.00 and 30.00 (set by your national)"),
    ).toBe("Your national requires chapter prices between $10.00 and $30.00");
    expect(
      tierErrorMessage("chapter dues must be between 10.00 and any amount (set by your national)"),
    ).toBe("Your national requires chapter prices of at least $10.00");
    expect(tierErrorMessage("your parent organization manages membership levels")).toBe(
      "Your parent organization manages membership levels",
    );
  });
});
