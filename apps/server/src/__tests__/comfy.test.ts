import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function setup(baseUrl: string, status: number) {
  vi.resetModules();
  vi.stubEnv("COMFY_BASE_URL", baseUrl);
  vi.stubEnv("COMFY_API_KEY", "workspace-test-key");
  const cancel = vi.fn(async () => undefined);
  const fetch = vi.fn<typeof globalThis.fetch>(async () => ({ status, ok: status >= 200 && status < 300, body: { cancel } }) as unknown as Response);
  vi.stubGlobal("fetch", fetch);
  const { checkComfyHealth } = await import("../comfy.js");
  return { checkComfyHealth, fetch, cancel };
}

describe("Comfy connection health", () => {
  it("keeps the local proxy health check", async () => {
    const { checkComfyHealth, fetch, cancel } = await setup("http://127.0.0.1:8189", 200);
    expect(await checkComfyHealth()).toBe(true);
    expect(fetch.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8189/api/v2/health");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([200, 404])("accepts remote asset lookup status %i without submitting a job", async status => {
    const { checkComfyHealth, fetch, cancel } = await setup("https://demo.run.comfy.app", status);
    expect(await checkComfyHealth()).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe(`https://demo.run.comfy.app/api/v2/assets/by-hash/blake3%3A${"0".repeat(64)}`);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("HEAD");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer workspace-test-key");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([401, 403, 405, 500, 503])("reports remote status %i as unavailable", async status => {
    const { checkComfyHealth } = await setup("https://demo.run.comfy.app", status);
    expect(await checkComfyHealth()).toBe(false);
  });

  it("does not accept a local 404 as healthy and handles connection failures", async () => {
    const { checkComfyHealth, fetch } = await setup("http://localhost:8189", 404);
    expect(await checkComfyHealth()).toBe(false);
    fetch.mockRejectedValueOnce(new Error("connection refused"));
    expect(await checkComfyHealth()).toBe(false);
  });

  it("tells the browser to check a deployment only once per page load", async () => {
    await setup("https://demo.run.comfy.app", 404);
    vi.stubEnv("ACCESS_KEY", "");
    const { createApp } = await import("../app.js");
    const response = await createApp({ health: async () => true }).request("/api/health");
    expect(await response.json()).toEqual({ server: "ok", comfy: "ok", poll: false });
  });
});
