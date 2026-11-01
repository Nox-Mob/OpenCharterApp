import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Tier } from "@/modules/membership/tiers";
import { EMPTY_TIER } from "@/modules/membership/tiers";
import { TierDialog } from "./tier-editor";

let latest: Tier = EMPTY_TIER;
function Harness({ nameOptional = false, renameHint = false } = {}) {
  const [value, setValue] = useState<Tier>(EMPTY_TIER);
  latest = value;
  return (
    <TierDialog
      nameOptional={nameOptional}
      renameHint={renameHint}
      open
      title="New membership level"
      value={value}
      onChange={setValue}
      onClose={() => {}}
      primaryLabel="Done"
      onPrimary={() => {}}
    />
  );
}

describe("TierDialog", () => {
  it("derives the level key from its name and keeps Done outside the scroll area", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Level name"), { target: { value: "Life Member" } });
    expect(latest.key).toBe("life_member");
    const scroll = screen.getByTestId("tier-scroll");
    expect(scroll.className).toContain("overflow-y-auto");
    expect(scroll.contains(screen.getByRole("button", { name: "Done" }))).toBe(false);
  });

  it("stores prices in cents and flags bad prices", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Term 1 price"), { target: { value: "25.50" } });
    expect(latest.terms[0]!.price_minor).toBe(2550);
    fireEvent.change(screen.getByLabelText("Term 1 price"), { target: { value: "abc" } });
    expect(screen.getByText("Enter a price like 25.00")).toBeInTheDocument();
    expect(Number.isNaN(latest.terms[0]!.price_minor)).toBe(true);
  });

  it("updates the term when its length changes, and adds or removes terms", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Term 1 length"), { target: { value: "3" } });
    expect(latest.terms[0]).toMatchObject({ key: "3_year", label: "3 years", length_count: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Add term" }));
    expect(latest.terms).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove term 2" }));
    expect(latest.terms).toHaveLength(1);
    // the only term can't be removed
    expect(screen.queryByRole("button", { name: "Remove term 1" })).not.toBeInTheDocument();
  });

  it("shows the chosen unit in the drop-down (new terms default to 1 year)", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Term 1 unit")).toHaveTextContent("Years");
  });
});

describe("single-level naming (D-126)", () => {
  it("marks the name optional for the only level", () => {
    render(<Harness nameOptional />);
    expect(screen.getByLabelText("Level name (optional)")).toHaveAttribute(
      "placeholder",
      "Membership",
    );
    expect(screen.getByText(/so it can go unnamed/)).toBeInTheDocument();
  });
  it("requires a name otherwise, and can suggest renaming the other level", () => {
    render(<Harness renameHint />);
    expect(screen.getByLabelText("Level name")).toBeInTheDocument();
    expect(screen.getByText(/Consider renaming it/)).toBeInTheDocument();
  });
});
