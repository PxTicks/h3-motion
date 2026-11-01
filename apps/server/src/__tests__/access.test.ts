import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { accessGate } from "../access.js";
import { createApp } from "../app.js";
import { SessionStore } from "../sessions.js";

afterEach(() => vi.unstubAllEnvs());

function setup(key?: string) {
  vi.stubEnv("ACCESS_KEY", key ?? "");
  const store = new SessionStore();
  const health = vi.fn(async () => true);
  return { app: createApp({ store, health }), store, health };
}

describe("hosted demo access", () => {
  it("blocks the app, static assets, files and job APIs before doing any work", async () => {
    const { app, store, health } = setup("demo-secret");
    for (const path of ["/", "/assets/app.js", "/api/health", "/api/files/private", "/missing"]) {
      const response = await app.request(path);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not Found");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expect((await app.request("/api/sessions", { method: "POST" })).status).toBe(404);
    expect((await app.request("/api/jobs/segment", { method: "POST", body: "invalid" })).status).toBe(404);
    expect(store.sessions.size).toBe(0);
    expect(health).not.toHaveBeenCalled();
  });

  it("exchanges the URL key for a secure cookie and preserves other query parameters", async () => {
    const { app, health } = setup("demo +/&secret");
    const response = await app.request(`https://demo.example/api/health?view=photo&key=${encodeURIComponent("demo +/&secret")}&view=video`);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/api/health?view=photo&view=video");
    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie).toContain("h3m_access=");
    for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) expect(cookie).toContain(attribute);
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(health).not.toHaveBeenCalled();
    const entered = await app.request("https://demo.example/api/health", { headers: { cookie: cookie.split(";")[0] } });
    expect(entered.status).toBe(200);
    expect(health).toHaveBeenCalledOnce();
    expect(entered.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("rejects incorrect keys and cookies, including different byte lengths", async () => {
    const { app } = setup("demo-secret");
    for (const value of ["", "wrong", "demo-secreT", "🔑".repeat(20)]) {
      const query = await app.request(`/?key=${encodeURIComponent(value)}`);
      expect(query.status).toBe(404);
      expect(query.headers.get("Set-Cookie")).toBeNull();
      expect((await app.request("/api/health", { headers: { cookie: `h3m_access=${encodeURIComponent(value)}` } })).status).toBe(404);
    }
    expect((await app.request("/?key=wrong", { headers: { cookie: "h3m_access=demo-secret" } })).status).toBe(404);
  });

  it("keeps redirects on this host and removes every key parameter", async () => {
    const { app } = setup("demo-secret");
    const response = await app.request("https://demo.example//elsewhere.example/path?key=demo-secret&key=another");
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/elsewhere.example/path");
  });

  it("serves robots.txt without a key and leaves local API access open when unset", async () => {
    const { app } = setup("demo-secret");
    const robots = await app.request("/robots.txt");
    expect(robots.status).toBe(200);
    expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
    expect(robots.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    const local = setup().app;
    expect((await local.request("/api/health")).status).toBe(200);
    expect((await local.request("/api/sessions", { method: "POST" })).status).toBe(200);
    expect((await local.request("/api/health?key=anything")).headers.get("Set-Cookie")).toBeNull();
  });

  it("adds the noindex header to errors from downstream handlers", async () => {
    const app = new Hono().use("*", accessGate("demo-secret")).get("/", () => { throw new Error("test"); });
    app.onError((_error, c) => c.text("failure", 500));
    const response = await app.request("/", { headers: { cookie: "h3m_access=demo-secret" } });
    expect(response.status).toBe(500);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });
});
