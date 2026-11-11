import { expect, test } from "./fixtures";
import { stagingSetting } from "../smoke/client";

// D-212: "Continue with Google" goes through Supabase Auth on the app's own project (no
// third-party broker). The browser is sent to the project's /auth/v1/authorize for Google, asking to come
// back to /auth. The request is answered here, so the test never reaches Google.
test("Continue with Google sends the browser to Supabase Auth for Google", async ({
  page,
  baseURL,
}) => {
  const backend = new URL(stagingSetting("VITE_SUPABASE_URL")).origin;
  let authorize: URL | undefined;
  await page.route(`${backend}/auth/v1/authorize**`, (route) => {
    authorize = new URL(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<p>google</p>" });
  });
  await page.goto("/auth?redirect=/orgs");
  // wait for the app to hydrate, or the click lands on the server-rendered button
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect.poll(() => authorize?.searchParams.get("provider")).toBe("google");
  const back = new URL(authorize!.searchParams.get("redirect_to")!);
  expect(back.pathname).toBe("/auth");
  expect(back.origin).toBe(new URL(baseURL!).origin);
});
