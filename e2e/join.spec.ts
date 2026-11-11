import { expect, test } from "./fixtures";
import { DEMO, signIn } from "./helpers";

// The public join page lists the organization's levels and lengths (hosted: needs an account).
test("the join page lists Riverside's levels", async ({ page }) => {
  await signIn(page, "empty");
  await page.goto(`/join/${DEMO.slug}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Riverside Community Association" }),
  ).toBeVisible();
  for (const level of ["Household", "Individual", "Senior (65+)", "Student"])
    await expect(page.getByText(level, { exact: true }).first()).toBeVisible();
});
