import { Comfy } from "@comfyorg/sdk";
import { ComfyLow } from "@comfyorg/sdk/low";
import { COMFY_BASE_URL, REMOTE_COMFY } from "./config.js";

export const comfy = new Comfy({ timeoutMs: 30_000, clientInfo: "h3-motion/0.0.0" });
export const comfyLow = new ComfyLow(COMFY_BASE_URL, process.env.COMFY_API_KEY, { timeoutMs: 3_000 });

export async function checkComfyHealth(): Promise<boolean> {
  try {
    const response = await comfyLow.request(REMOTE_COMFY ? "HEAD" : "GET", REMOTE_COMFY
      ? `/api/v2/assets/by-hash/${encodeURIComponent(`blake3:${"0".repeat(64)}`)}`
      : "/api/v2/health");
    await response.body?.cancel();
    return REMOTE_COMFY ? [200, 404].includes(response.status) : response.ok;
  } catch {
    return false;
  }
}
