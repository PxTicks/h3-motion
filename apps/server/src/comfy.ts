import { Comfy } from "@comfyorg/sdk";
import { ComfyLow } from "@comfyorg/sdk/low";
import { COMFY_BASE_URL, REMOTE_COMFY } from "./config.js";

export const comfy = new Comfy({ timeoutMs: 30_000, clientInfo: "h3-motion/0.0.0" });
export const comfyLow = new ComfyLow(COMFY_BASE_URL, process.env.COMFY_API_KEY, { timeoutMs: 3_000 });

export async function checkComfyHealth(): Promise<boolean> {
  try {
    // Deployments have no health route. Listing one job is answered without a GPU worker, and unlike an asset
    // lookup it tells a valid deployment (200) from a mistyped one (404) as well as from a bad key (401).
    const response = await comfyLow.request("GET", REMOTE_COMFY ? "/api/v2/jobs?limit=1" : "/api/v2/health");
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}
