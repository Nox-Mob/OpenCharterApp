import { expect, test } from "./fixtures";
import { readFile } from "node:fs/promises";
import { openOrg, signIn } from "./helpers";

// A3 (D-173): the payments export downloads a CSV with the bookkeeping columns.
test("export payments from Settings → Payments", async ({ page }) => {
  await signIn(page, "national");
  await openOrg(page, "national", "payments");
  const card = page.getByRole("region", { name: "Export payments" });
  await expect(card).toBeVisible();
  await card.getByLabel("From").fill("2020-01-01");
  await card.getByRole("checkbox").check();
  const download = page.waitForEvent("download");
  await card.getByRole("button", { name: "Export CSV" }).click();
  const file = await (await download).path();
  const csv = (await readFile(file!, "utf8")).replace(/^\uFEFF/, "");
  expect(csv.split("\r\n")[0]).toBe(
    "Organization,Date,Member,Email,Purpose,Level,Term,Amount,Refunded,Net,Currency,Status,Method,Gateway,Test payment,Reference,Receipt,Tax treatment",
  );
});
