import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(async (_fn: string, _a?: unknown) => ({ data: "new-id", error: null })),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};

import { AdoptLevelDialog } from "./suggested-level-dialogs";

const level = {
  id: "src",
  name: "Regular",
  terms: [
    {
      id: "t1",
      key: "1y",
      label: "1 year",
      length_count: 1,
      length_unit: "year" as const,
      price_minor: 5000,
      currency: "USD",
    },
    {
      id: "t2",
      key: "life",
      label: "Lifetime",
      length_count: null,
      length_unit: null,
      price_minor: 30000,
      currency: "USD",
    },
  ],
};

describe("AdoptLevelDialog (A4)", () => {
  it("explains copy and link, previews linked prices, and links with the rule", async () => {
    const onDone = vi.fn();
    render(
      <AdoptLevelDialog
        orgId="a"
        level={level}
        sourceName="Nat"
        range={{ min: null, max: null }}
        onClose={vi.fn()}
        onDone={onDone}
      />,
    );
    expect(screen.getByText(/Later changes at the national don't affect it/)).toBeInTheDocument();
    expect(screen.getByText(/changes when theirs does/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Link to it" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Your price" }));
    fireEvent.click(await screen.findByRole("option", { name: "A percentage less" }));
    fireEvent.change(screen.getByLabelText("Percent less"), { target: { value: "20" } });
    const prices = screen.getByRole("list", { name: "Your prices" });
    expect(within(prices).getByText("$40.00")).toBeInTheDocument();
    expect(within(prices).getByText("$240.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Link this level" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("adopt_suggested_level", {
        _org: "a",
        _source: "src",
        _mode: "linked",
        _rule: "minus_percent",
        _value: 20,
      }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("copies with no price rule", async () => {
    rpc.mockClear();
    render(
      <AdoptLevelDialog
        orgId="a"
        level={level}
        sourceName="Nat"
        range={{ min: null, max: null }}
        onClose={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Copy it" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy this level" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        "adopt_suggested_level",
        expect.objectContaining({ _mode: "copy", _value: 0 }),
      ),
    );
  });
});
