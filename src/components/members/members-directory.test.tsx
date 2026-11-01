import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => ({
      data: [
        { profile_id: "1", display_name: "Morgan", fields: { Rank: "E-4", Branch: ["Navy"] } },
        { profile_id: "2", display_name: "Yara", fields: {} },
      ],
      error: null,
    }),
  },
}));
import { MembersDirectory } from "./members-directory";

describe("MembersDirectory", () => {
  it("lists members with their directory fields and searches names and fields", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MembersDirectory orgId="o" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Morgan")).toBeInTheDocument();
    expect(screen.getByText("E-4")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search the directory"), { target: { value: "navy" } });
    expect(screen.queryByText("Yara")).not.toBeInTheDocument();
    expect(screen.getByText("Morgan")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search the directory"), { target: { value: "zzz" } });
    expect(screen.getByText("Nobody matches that search.")).toBeInTheDocument();
  });
});
