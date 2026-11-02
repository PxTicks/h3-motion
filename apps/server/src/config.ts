import { fileURLToPath } from "node:url";
import { DEFAULT_PROXY_URL } from "@h3-motion/shared";

export const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
export const DATA_ROOT = fileURLToPath(new URL("../../../.data/", import.meta.url));
export const COMFY_BASE_URL = process.env.COMFY_BASE_URL ?? DEFAULT_PROXY_URL;
export const REMOTE_COMFY = !["localhost", "127.0.0.1"].includes(new URL(COMFY_BASE_URL).hostname);
// The SDK resolves the deployment from this environment variable.
process.env.COMFY_BASE_URL = COMFY_BASE_URL;
/** Splices the third-party Spectrum H3 speed-up into the animate graph. Off by default: judges would need the extra node pack. */
export const SPECTRUM_ENABLED = process.env.H3M_SPECTRUM === "1";
/** Layers core sol-attn sparse attention over Comfy Kitchen attention in both H3 workflows. Off by default; H3M_SOL=1 enables it. */
export const SOL_ENABLED = process.env.H3M_SOL === "1";
