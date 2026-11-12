// Nitro plugin: the self-hosted app's email sender (S-16), on the Worker's cron trigger.
// Add a trigger to your Worker (wrangler: "triggers": { "crons": ["*/5 * * * *"] }).
// Hosted builds have no trigger, and runCharterEmail does nothing when hosted.
import { definePlugin } from "nitro";
import { runCharterEmail } from "../src/modules/email/email.server";

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:scheduled", async ({ env }: { env: Record<string, unknown> }) => {
    const strings: Record<string, string | undefined> = {
      ...(process.env as Record<string, string>),
    };
    for (const [k, v] of Object.entries(env ?? {})) if (typeof v === "string") strings[k] = v;
    try {
      const result = await runCharterEmail(strings);
      if (result && (result.sent || result.failed || result.retried))
        console.log("email", JSON.stringify(result));
    } catch (error) {
      console.error("email", error);
    }
  });
});
