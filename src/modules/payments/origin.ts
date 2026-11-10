/**
 * The public address of the app, for links that leave it and come back (checkout success /
 * cancel, the test checkout page). D-158.
 *
 * Behind a proxy or edge host the server can see its own internal URL (e.g. http://localhost:3000), so
 * `new URL(request.url).origin` sent people to "localhost" after paying. Instead, in order:
 * 1. PUBLIC_APP_URL, when the operator sets it (self-hosting, custom domains);
 * 2. the browser's address: the Origin header of the request, else the Referer;
 * 3. the proxy's forwarded host (X-Forwarded-Host / X-Forwarded-Proto);
 * 4. the request URL, as a last resort (local development).
 * Only http(s) origins are accepted, and plain http only for localhost. Browser- and
 * proxy-supplied values must also be on the allowlist (`isAllowedOrigin`), so a caller can't
 * point checkout return links at a site they control.
 */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value || value === "null") return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.protocol === "http:" && !isLocalHost(u.hostname)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

const isLocalHost = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";

/**
 * Origins the app may send people back to: the configured PUBLIC_APP_URL, any extra origins in
 * PUBLIC_APP_ALLOWED_ORIGINS (comma-separated), the request's own
 * origin, and localhost.
 */
export function isAllowedOrigin(
  origin: string,
  requestOrigin: string,
  configured: string | undefined,
  extra: string | undefined,
): boolean {
  const host = new URL(origin).hostname;
  if (isLocalHost(host)) return true;
  if (origin === requestOrigin) return true;
  const list = [configured, ...(extra ?? "").split(",")]
    .map((v) => normalizeOrigin(v?.trim()))
    .filter((v): v is string => !!v);
  return list.includes(origin);
}

export function publicOrigin(
  headers: { get(name: string): string | null },
  requestUrl: string,
  configured: string | undefined = undefined,
  extraAllowed: string | undefined = undefined,
): string {
  const requestOrigin = new URL(requestUrl).origin;
  const fixed = normalizeOrigin(configured);
  if (fixed) return fixed;
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const candidates = [
    headers.get("origin"),
    headers.get("referer"),
    forwardedHost ? `${forwardedProto}://${forwardedHost}` : null,
  ];
  for (const c of candidates) {
    const o = normalizeOrigin(c);
    if (o && isAllowedOrigin(o, requestOrigin, configured, extraAllowed)) return o;
  }
  return requestOrigin;
}
