import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db/pending-schema";

/**
 * Account page (U4, D-192): a person's own name, sign-in email and password. The name is shown
 * on their member record in every organization they belong to. A new email takes effect once
 * confirmed from the link sent to it; their member records then follow it (sync_my_email).
 */
export const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name")
  .max(120, "That name is too long");
export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");
export const passwordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "The passwords don't match",
    path: ["confirm"],
  });

export async function saveMyName(userId: string, name: string) {
  const { error: authError } = await supabase.auth.updateUser({ data: { full_name: name } });
  if (authError) throw authError;
  const { error } = await supabase
    .from("org_member_profiles")
    .update({ display_name: name })
    .eq("user_id", userId);
  if (error) throw error;
}

/** Sends a confirmation link to the new address; the change applies once it's opened. */
export async function changeMyEmail(email: string) {
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${window.location.origin}/account` },
  );
  if (error) throw error;
}

export async function changeMyPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** Bring the member records in line with a confirmed new sign-in email. */
export async function syncMyEmail(): Promise<number> {
  const { data, error } = await db.rpc("sync_my_email");
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

export function accountErrorMessage(message: string): string {
  if (/same.*password|different from the old/i.test(message))
    return "Choose a password different from your current one.";
  if (/weak|pwned|too common/i.test(message)) return "That password is too easy to guess.";
  if (/already.*registered|already been registered|exists/i.test(message))
    return "Another account already uses that email.";
  if (/rate limit|too many/i.test(message)) return "Too many tries. Please wait a minute.";
  if (/reauthenticat|recent login/i.test(message))
    return "For your security, sign out and back in, then try again.";
  return "That didn't work. Please try again.";
}
