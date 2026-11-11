import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "./fixtures";
import { openRiverside, signIn } from "./helpers";

// S-06: Settings → General → Export everything downloads every table for the organization.
test("the owner downloads everything as a zip of CSVs and JSON", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "owner");
  await openRiverside(page, "settings");
  const button = page.getByRole("button", { name: "Download export (.zip)" });
  await expect(button).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  expect(download.suggestedFilename()).toMatch(
    /^riverside-community-association-charter-export-\d{4}-\d{2}-\d{2}\.zip$/,
  );
  const zip = unzipSync(readFileSync((await download.path())!));
  expect(Object.keys(zip)).toEqual(
    expect.arrayContaining(["README.txt", "charter-export.json", "csv/member_profiles.csv"]),
  );
  const json = JSON.parse(strFromU8(zip["charter-export.json"]!));
  expect(json.counts.member_profiles).toBeGreaterThan(100);
  expect(json.counts.payments).toBeGreaterThan(100);
  expect(json.tables.units[0].name).toBe("Riverside Community Association");
});
