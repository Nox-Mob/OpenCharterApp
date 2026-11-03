import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Org } from "@/lib/orgs";

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(async (_fn: string, a: { _rows: unknown[]; _apply: boolean }) => ({
    data: {
      rows: a._rows.length,
      create: a._rows.length,
      update: 0,
      errors: [] as { row: number; message: string }[],
      applied: a._apply,
    },
    error: null,
  })),
}));
vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq", "order"]) chain[m] = () => chain;
  chain["then"] = (ok: (v: unknown) => unknown) =>
    ok({
      data: [
        {
          id: "d1",
          org_id: "o",
          key: "rank",
          label: "Rank",
          data_type: "text",
          applies_to: "member",
          active: true,
          attribute_options: [],
        },
      ],
      error: null,
    });
  return { supabase: { rpc, from: () => chain } };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};

import { ImportMembersDialog } from "./import-members-dialog";

const org = { id: "o", name: "Austin", ancestor_ids: [] } as unknown as Org;

describe("ImportMembersDialog (U1)", () => {
  it("reads a file, matches columns, checks it without saving, then imports", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ImportMembersDialog org={org} homeChapterNational={false} open onClose={() => {}} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText("Spreadsheet (CSV)")).toBeEnabled());
    const csv = "Name,Email,Rank,Shoe size\nAnn Lee,ann@x.org,E-4,9\nBo,,,\n";
    const file = new File([csv], "members.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Spreadsheet (CSV)"), { target: { files: [file] } });
    expect(await screen.findByText(/2 members in members.csv/)).toBeInTheDocument();
    // guessed: Name, Email and the Rank field; the unknown column isn't imported
    expect(screen.getByLabelText("Column Shoe size")).toHaveTextContent("Don't import");
    expect(screen.getByRole("button", { name: "Import 2 members" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Check the file" }));
    expect(await screen.findByText(/Ready to import: 2 new/)).toBeInTheDocument();
    expect(rpc).toHaveBeenLastCalledWith("import_members", {
      _org: "o",
      _rows: [
        expect.objectContaining({
          row: 2,
          name: "Ann Lee",
          email: "ann@x.org",
          fields: { d1: "E-4" },
        }),
        expect.objectContaining({ row: 3, name: "Bo", email: "", fields: {} }),
      ],
      _apply: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "Import 2 members" }));
    expect(
      await screen.findByText(/Imported 2 members: 2 added and 0 updated/),
    ).toBeInTheDocument();
    expect(rpc).toHaveBeenLastCalledWith(
      "import_members",
      expect.objectContaining({ _apply: true }),
    );
  });

  it("lists rows to fix and keeps Import off", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        rows: 1,
        create: 0,
        update: 0,
        errors: [{ row: 2, message: "write dates as YYYY-MM-DD" }],
        applied: false,
      },
      error: null,
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ImportMembersDialog org={org} homeChapterNational={false} open onClose={() => {}} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText("Spreadsheet (CSV)")).toBeEnabled());
    const file = new File(["Name,Joined\nAnn,05/01/2020\n"], "m.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Spreadsheet (CSV)"), { target: { files: [file] } });
    fireEvent.click(await screen.findByRole("button", { name: "Check the file" }));
    expect(await screen.findByText("Row 2: write dates as YYYY-MM-DD")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 1 member" })).toBeDisabled();
  });
});
