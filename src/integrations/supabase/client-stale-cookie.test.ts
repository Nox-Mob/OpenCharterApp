// Hosted: Charter builds its own browser client, so it must drop stale copies of the sign-in
// cookie itself before the client reads them (shared 1.23.2). Otherwise a first visit straight
// to Charter opens as whoever last used an old cookie on a wider domain.
import { describe, expect, it, vi } from "vitest";

const drop = vi.fn();
vi.mock("../../../shared/supabase/hosted", () => ({ isHosted: () => true }));
vi.mock("../../../shared/supabase/client", () => ({
  cookieOptions: () => ({ path: "/" }),
  dropStaleSession: drop,
}));
vi.mock("@supabase/ssr", () => ({ createBrowserClient: () => ({ auth: {} }) }));

describe("Charter's hosted browser client", () => {
  it("drops stale sign-in cookies before it is created", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    const { supabase } = await import("./client");
    void supabase.auth;
    expect(drop).toHaveBeenCalledWith({
      url: "https://abcdefghijklmnop.supabase.co",
      key: "sb_publishable_test",
    });
  });
});
