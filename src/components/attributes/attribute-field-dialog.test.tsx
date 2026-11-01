import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AttributeInput } from "@/engines/attributes";
import { AttributeFieldDialog } from "./attribute-field-dialog";
import { EMPTY_ATTRIBUTE } from "./attribute-form";

const rankList = (n: number): AttributeInput => ({
  ...EMPTY_ATTRIBUTE,
  label: "Rank",
  key: "rank",
  data_type: "ordered",
  options: Array.from({ length: n }, (_, i) => ({ value: `r${i + 1}`, label: `R${i + 1}` })),
});

function Harness({ initial, onSave = () => {} }: { initial: AttributeInput; onSave?: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <AttributeFieldDialog
      open
      title="Add a member field"
      value={value}
      onChange={setValue}
      onClose={() => {}}
      primaryLabel="Save field"
      onPrimary={onSave}
    />
  );
}

describe("AttributeFieldDialog", () => {
  it("scrolls the form body and keeps the save button outside the scroll area", () => {
    render(<Harness initial={rankList(30)} />);
    const scroll = screen.getByTestId("attribute-field-scroll");
    expect(scroll.className).toContain("overflow-y-auto");
    expect(scroll.closest('[role="dialog"]')?.className).toContain("max-h-[90vh]");
    const save = screen.getByRole("button", { name: "Save field" });
    expect(scroll.contains(save)).toBe(false);
    expect(scroll.contains(screen.getByLabelText("Choice 30"))).toBe(true);
  });

  it("still saves with a long choice list", () => {
    const onSave = vi.fn();
    render(<Harness initial={rankList(30)} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Save field" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("focuses the new choice after Add choice", () => {
    render(<Harness initial={rankList(3)} />);
    fireEvent.click(screen.getByRole("button", { name: "Add choice" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Choice 4"));
  });
});
