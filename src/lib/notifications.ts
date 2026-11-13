// Where each person chooses their notifications (core 0013, shared 1.16.0): on OpenAppHub's
// account page when hosted (the choices are suite-wide), on this app's account page self-hosted.
import { hubUrl, isHosted } from "@shared/supabase/hosted";

export function notificationSettingsHref(
  hosted: boolean = isHosted(),
  hub: (path: string) => string = hubUrl,
): string {
  return hosted ? hub("/account#notifications") : "/account#notifications";
}
