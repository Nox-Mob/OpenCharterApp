import { supabase } from "@/integrations/supabase/client";

/**
 * Logo fallback (data-domains §1 Branding asset): chapter → region → national.
 * When the national disallows chapter logos, the top-most logo in the lineage is used.
 * chain is ordered root first, self last.
 */
export function resolveLogo(
  chain: readonly { id: string; logo_path: string | null }[],
  chapterLogoAllowed: boolean,
): { path: string; orgId: string } | null {
  const withLogo = chain.filter((c) => c.logo_path);
  const pick = chapterLogoAllowed ? withLogo[withLogo.length - 1] : withLogo[0];
  return pick ? { path: pick.logo_path!, orgId: pick.id } : null;
}

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export function validateLogo(file: { type: string; size: number }): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type))
    return "Use a PNG, JPG, SVG or WebP image";
  if (file.size > LOGO_MAX_BYTES) return "Logo must be 2 MB or smaller";
  return null;
}

export async function logoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("branding").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function uploadLogo(orgId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${orgId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("branding")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  const { error: e2 } = await supabase
    .from("organizations")
    .update({ logo_path: path })
    .eq("id", orgId);
  if (e2) throw e2;
  return path;
}
