import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

async function solEnabled(value?: string) {
  vi.resetModules();
  vi.stubEnv("H3M_SOL", value);
  return (await import("../config.js")).SOL_ENABLED;
}

describe("sol-attn switch", () => {
  it("is off unless H3M_SOL=1, so hosted and local runs match without configuration", async () => {
    expect(await solEnabled(undefined)).toBe(false);
    expect(await solEnabled("0")).toBe(false);
    expect(await solEnabled("1")).toBe(true);
  });
});
