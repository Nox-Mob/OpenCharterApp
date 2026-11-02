import { fireEvent, render, screen } from "@testing-library/react";
import { PricingRulesQuestion } from "./pricing-rules-question";
import type { PricingRuleAnswer } from "@/modules/membership/setup-flow";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import { toast } from "sonner";

const tiers = [
  {
    key: "reg",
    name: "Regular",
    description: "",
    tax_treatment: "non_deductible" as const,
    terms: [
      {
        key: "1y",
        label: "1 year",
        length_count: 1,
        length_unit: "year" as const,
        price_minor: 5000,
        currency: "USD",
      },
    ],
  },
];
const attrs = new Map([
  [
    "rank",
    {
      id: "rank",
      label: "Rank",
      data_type: "ordered",
      options: [{ value: "e5", label: "E-5", sort_order: 1 }],
    },
  ],
]);

describe("PricingRulesQuestion (A6)", () => {
  it("adds a named discount rule for a term", () => {
    const onChange = vi.fn();
    render(<PricingRulesQuestion value={[]} onChange={onChange} tiers={tiers} attrs={attrs} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a pricing rule" }));
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(toast.error).toHaveBeenCalledWith("Give the rule a name, e.g. Veterans");
    fireEvent.change(screen.getByLabelText("Rule name"), { target: { value: "Veterans" } });
    fireEvent.change(screen.getByLabelText("Discount percent"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(onChange).toHaveBeenCalledWith([
      {
        tier_key: "reg",
        term_key: "1y",
        label: "Veterans",
        conditions: [],
        price_minor: null,
        discount_pct: 20,
      },
    ]);
  });

  it("lists rules in words and explains when there are no fields or levels yet", () => {
    const rules: PricingRuleAnswer[] = [
      {
        tier_key: "reg",
        term_key: "1y",
        label: "NCOs",
        conditions: [{ attribute_id: "rank", op: "at_least", value: "e5" }],
        price_minor: 3000,
        discount_pct: null,
      },
    ];
    const { rerender } = render(
      <PricingRulesQuestion value={rules} onChange={vi.fn()} tiers={tiers} attrs={attrs} />,
    );
    expect(screen.getByText(/Rank is at least E-5/)).toBeInTheDocument();
    expect(screen.getByText(/\$30\.00/)).toBeInTheDocument();
    rerender(
      <PricingRulesQuestion value={[]} onChange={vi.fn()} tiers={tiers} attrs={new Map()} />,
    );
    expect(screen.getByText(/Apply setup with your member fields first/)).toBeInTheDocument();
    rerender(<PricingRulesQuestion value={[]} onChange={vi.fn()} tiers={[]} attrs={attrs} />);
    expect(screen.getByText(/Add a membership level first/)).toBeInTheDocument();
  });
});
