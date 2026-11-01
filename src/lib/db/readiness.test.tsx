import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let probeError: { code?: string; message?: string } | null = null;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ limit: async () => ({ error: probeError }) }) }),
    rpc: async () => ({ error: probeError }),
  },
}));

import { featureReadyQuery, isMissingSchemaError } from "./readiness";
import { RequiresDatabase } from "@/components/db/requires-database";

describe("isMissingSchemaError", () => {
  it("recognizes missing tables and functions", () => {
    expect(isMissingSchemaError({ code: "PGRST205" })).toBe(true);
    expect(isMissingSchemaError({ code: "PGRST202" })).toBe(true);
    expect(isMissingSchemaError({ code: "42P01" })).toBe(true);
    expect(
      isMissingSchemaError({
        message: "Could not find the table 'public.memberships' in the schema cache",
      }),
    ).toBe(true);
  });
  it("treats everything else as a real error, not a missing migration", () => {
    expect(isMissingSchemaError(null)).toBe(false);
    expect(isMissingSchemaError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingSchemaError({ code: "PGRST301", message: "JWT expired" })).toBe(false);
  });
});

describe("featureReadyQuery", () => {
  const run = () => featureReadyQuery("memberships").queryFn!({} as never);
  it("is not ready when the probe table is missing", async () => {
    probeError = { code: "PGRST205" };
    expect(await run()).toBe(false);
  });
  it("is ready when the probe succeeds or fails for another reason", async () => {
    probeError = null;
    expect(await run()).toBe(true);
    probeError = { code: "42501" };
    expect(await run()).toBe(true);
  });
});

describe("RequiresDatabase", () => {
  const renderWith = (ready: boolean | undefined, fallback?: React.ReactNode) => {
    const qc = new QueryClient();
    if (ready !== undefined) qc.setQueryData(["db-ready", "memberships"], ready);
    else qc.setQueryDefaults(["db-ready", "memberships"], { queryFn: () => new Promise(() => {}) });
    return render(
      <QueryClientProvider client={qc}>
        <RequiresDatabase feature="memberships" {...(fallback !== undefined ? { fallback } : {})}>
          <p>Membership panel</p>
        </RequiresDatabase>
      </QueryClientProvider>,
    );
  };
  it("shows its content once the migration is applied", () => {
    renderWith(true);
    expect(screen.getByText("Membership panel")).toBeInTheDocument();
  });
  it("explains which migration is missing", () => {
    renderWith(false);
    expect(screen.queryByText("Membership panel")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("migration 0008_memberships");
  });
  it("can show a custom fallback, or nothing", () => {
    const { container } = renderWith(false, null);
    expect(container).toBeEmptyDOMElement();
  });
});
