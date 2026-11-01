import { render, screen } from "@testing-library/react";
import { SetupStepFrame } from "./step-frame";

describe("SetupStepFrame", () => {
  it("scrolls the step content and keeps the title and buttons outside the scroll area", () => {
    render(
      <SetupStepFrame header={<h2>Member fields</h2>} footer={<button>Save and continue</button>}>
        {Array.from({ length: 50 }, (_, i) => (
          <p key={i}>Field {i + 1}</p>
        ))}
      </SetupStepFrame>,
    );
    const scroll = screen.getByTestId("setup-step-scroll");
    expect(scroll.className).toContain("overflow-y-auto");
    expect(scroll.closest("section")?.className).toContain("max-h-");
    expect(scroll.contains(screen.getByText("Field 50"))).toBe(true);
    expect(scroll.contains(screen.getByRole("button", { name: "Save and continue" }))).toBe(false);
    expect(scroll.contains(screen.getByRole("heading", { name: "Member fields" }))).toBe(false);
  });

  it("scrolls back to the top when the step changes", () => {
    const { rerender } = render(
      <SetupStepFrame header="A" footer="" scrollKey={0}>
        body
      </SetupStepFrame>,
    );
    const scroll = screen.getByTestId("setup-step-scroll");
    const calls: unknown[] = [];
    scroll.scrollTo = ((o: unknown) => calls.push(o)) as typeof scroll.scrollTo;
    rerender(
      <SetupStepFrame header="B" footer="" scrollKey={1}>
        body
      </SetupStepFrame>,
    );
    expect(calls).toEqual([{ top: 0 }]);
  });
});
