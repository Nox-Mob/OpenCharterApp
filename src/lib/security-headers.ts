/**
 * Security headers for every response the Worker renders (spec §10.1, suite step 3, D-219).
 * Static assets are served by Cloudflare's asset layer before the Worker runs; their cache rule
 * comes from nitro's generated `_headers`.
 *
 * The CSP allows the app itself, its Supabase project (API, auth, storage signed URLs) and Google
 * Fonts (the stylesheet in `__root.tsx`). Stripe Checkout is a full-page redirect, which CSP
 * doesn't restrict. `'unsafe-inline'` stays for scripts and styles for now: TanStack Start's SSR
 * writes inline hydration scripts, and toasts and dialogs set inline styles. Moving scripts to a
 * per-request nonce is a later hardening step.
 */
export function contentSecurityPolicy(supabaseUrl: string | undefined): string {
  const supabase = originOf(supabaseUrl);
  const connect = ["'self'", ...(supabase ? [supabase, supabase.replace(/^https:/, "wss:")] : [])];
  const img = ["'self'", "data:", "blob:", ...(supabase ? [supabase] : [])];
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src ${img.join(" ")}`,
    `connect-src ${connect.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(supabaseUrl: string | undefined): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": contentSecurityPolicy(supabaseUrl),
  };
}

/** Returns the response with the security headers added; headers already set are kept. */
export function withSecurityHeaders(response: Response, supabaseUrl: string | undefined): Response {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders(supabaseUrl))) {
    if (!out.headers.has(name)) out.headers.set(name, value);
  }
  return out;
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}
