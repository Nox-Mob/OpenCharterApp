/**
 * The public address of the app, for links that leave it and come back (checkout success /
 * cancel, the test checkout page). D-158.
 *
 * Behind Lovable's hosting the server sees its own internal URL (e.g. http://localhost:3000), so
 * `new URL(request.url).origin` sent people to "localhost" after paying. Instead, in order:
 * 1. PUBLIC_APP_URL, when the operator sets it (self-hosting, custom domains);
 * 2. the browser's address: the Origin header of the request, else the Referer;
 * 3. the proxy's forwarded host (X-Forwarded-Host / X-Forwarded-Proto);
 * 4. the request URL, as a last resort (local development).
 * Only http(s) origins are accepted, and plain http only for localhost.
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

export function publicOrigin(
  headers: { get(name: string): string | null },
  requestUrl: string,
  configured: string | undefined = undefined,
): string {
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const candidates = [
    configured,
    headers.get("origin"),
    headers.get("referer"),
    forwardedHost ? `${forwardedProto}://${forwardedHost}` : null,
  ];
  for (const c of candidates) {
    const o = normalizeOrigin(c);
    if (o) return o;
  }
  return new URL(requestUrl).origin;
}
