// @vitest-environment node
import { describe, expect, it } from "vitest";
import { reportsPdf } from "./pdf";

describe("reports PDF", () => {
  it("has the organization, every section and its rows", () => {
    const doc = reportsPdf({
      organization: "Riverside",
      subtitle: "As of Nov 12, 2026",
      sections: [
        {
          heading: "Members",
          header: ["Organization", "Current members"],
          rows: [["Riverside", 141]],
        },
        { heading: "Revenue", header: ["Organization", "Net"], rows: [] },
      ],
    });
    const raw = doc.output();
    for (const t of [
      "Riverside: reports",
      "Members",
      "Current members",
      "141",
      "Revenue",
      "Nothing to show.",
    ])
      expect(raw).toContain(t);
  });

  it("continues long tables on more pages", () => {
    const rows = Array.from({ length: 200 }, (_, i) => [`Chapter ${i}`, i]);
    const doc = reportsPdf({
      organization: "N",
      subtitle: "",
      sections: [{ heading: "Members", header: ["Organization", "Members"], rows }],
    });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});
