import { createHash, timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { getCookie, setCookie } from "hono/cookie";

/** Hash first so timingSafeEqual always compares fixed-length buffers. */
function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function accessGate(key = process.env.ACCESS_KEY) {
  const expected = key ? digest(key) : undefined;
  const matches = (value: string | undefined) => value !== undefined && expected !== undefined && timingSafeEqual(digest(value), expected);

  return createMiddleware(async (c, next) => {
    c.header("X-Robots-Tag", "noindex, nofollow");
    if (c.req.path === "/robots.txt") return c.text("User-agent: *\nDisallow: /\n");
    if (!expected) return next();

    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    const url = new URL(c.req.url);
    if (url.searchParams.has("key")) {
      if (!matches(url.searchParams.get("key")!)) return c.text("Not Found", 404);
      // Outlive browser restarts so judges can return without the original link.
      setCookie(c, "h3m_access", key!, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 14 * 24 * 60 * 60 });
      url.searchParams.delete("key");
      // Keep the redirect relative to this host, including for paths starting with //.
      return c.redirect(`/${url.pathname.replace(/^\/+/, "")}${url.search}`, 303);
    }
    if (!matches(getCookie(c, "h3m_access"))) return c.text("Not Found", 404);
    await next();
  });
}
