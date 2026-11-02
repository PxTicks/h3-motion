import { z } from "zod";
import { captionSchema } from "./description.js";
import { frameCountSchema, videoDimensionSchema } from "./media.js";
import type { FrameSize } from "./media.js";
import { inpaintResultSchema } from "./inpaint.js";
import { buildMotionCurve, placeRect } from "./motion.js";
import type { Rect, SubjectMotion } from "./motion.js";
import { trackResultSchema } from "./tracking.js";

export const pointSchema = z.object({ x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative() });
const idSchema = z.uuid();
export function canApplyPointPrompt(hasPrior: boolean, positive: readonly unknown[], negative: readonly unknown[]): boolean {
  return positive.length > 0 || (hasPrior && negative.length > 0);
}
export const segmentRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("text"), text: z.string().trim().min(1).max(160), imageId: idSchema }),
  z.object({ mode: z.literal("points"), imageId: idSchema, candidateId: idSchema.optional(),
    positive: z.array(pointSchema).max(64), negative: z.array(pointSchema).max(64) })
    .refine(request => canApplyPointPrompt(!!request.candidateId, request.positive, request.negative),
      { message: "New subjects need an include point; mask edits need at least one include or exclude point." }),
]);
export type SegmentRequest = z.infer<typeof segmentRequestSchema>;

export const imageAssetSchema = z.object({
  id: idSchema, url: z.string(), width: z.number().int().positive(), height: z.number().int().positive(),
});
export type ImageAsset = z.infer<typeof imageAssetSchema>;
export const maskCandidateSchema = z.object({
  id: idSchema, url: z.string(),
  bounds: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
});
export type MaskCandidate = z.infer<typeof maskCandidateSchema>;
export const isolateRequestSchema = z.object({
  imageId: idSchema, maskId: idSchema,
  userText: z.string().trim().max(160).default(""),
  instruction: z.string().trim().min(1).max(2000).optional(),
  seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});
export type IsolateRequest = z.infer<typeof isolateRequestSchema>;
export const isolationResultSchema = z.object({
  imageId: idSchema, maskId: idSchema, plate: imageAssetSchema,
  phrase: z.string(), caption: captionSchema, instruction: z.string(),
  descriptionSource: z.enum(["model", "fallback"]),
  instructionSource: z.enum(["model", "custom"]),
  seed: z.number().int().nonnegative(),
});
export type IsolationResult = z.infer<typeof isolationResultSchema>;
/** TTM's end_step on the six-step turbo schedule: the subject is held to its path until this step. 6 holds every step. */
export const LOCK_IN = { min: 2, max: 6, step: 1, default: 2 } as const;
/** How far the held subject mask is eroded before TTM, in generation-canvas pixels. 16 is one H3 latent cell; by default small subjects get less, see autoEdgeFreedom. */
export const EDGE_FREEDOM = { min: 0, max: 64, step: 4, default: 16 } as const;
/**
 * TTM holds whole H3 tokens, 2 × 2 patches of 16 px latent cells, and only if all four cells are held. Nearest
 * sampling reads each cell from one pixel, so a token needs two samples 16 px apart on each axis, at 32k and 32k + 16:
 * any 48 px span has them wherever the grid falls, and two tokens side by side need 80. Windows are [rows, columns].
 */
const ONE_TOKEN = [[48, 48]] as const, TWO_TOKENS = [[48, 80], [80, 48]] as const;
/** A subject to hold: its bounds and path, and its binary mask (non-zero inside) as a `width`-wide raster in the same pixels. */
export interface HeldSubject { bounds: Rect; motion: SubjectMotion<number>; mask?: { data: Uint8Array | Uint8ClampedArray; width: number } }
const heldCache = new WeakMap<object, Map<string, number>>();

/**
 * The edge freedom that still holds two tokens of every subject wherever the token grid falls, or one if the subject
 * is too small for two, snapped down to the slider's step and capped at the default; 0 if not even one fits.
 * Subjects are measured by their shape in generation pixels, at their smallest scale over the frames where they are
 * wholly in view: an edge cutting one off would otherwise pull every subject to 0. Without a mask, the bounds stand in.
 */
export function autoEdgeFreedom(subjects: HeldSubject[], layers: FrameSize, generation: FrameSize): number {
  const kx = generation.width / layers.width, ky = generation.height / layers.height;
  let result: number = EDGE_FREEDOM.default;
  for (const subject of subjects) {
    const { bounds, motion } = subject, curve = buildMotionCurve(motion);
    let sx = Infinity, sy = Infinity;
    for (let frame = 0; frame < motion.frames; frame++) {
      const placement = curve.placementAt(frame), { x, y, width, height } = placeRect(bounds, placement);
      if (x < 0 || y < 0 || x + width > layers.width || y + height > layers.height) continue;
      sx = Math.min(sx, Math.abs(placement.sx)); sy = Math.min(sy, Math.abs(placement.sy));
    }
    if (Number.isFinite(sx)) result = Math.min(result, heldEdgeFreedom(subject, Math.round(bounds.width * kx * sx), Math.round(bounds.height * ky * sy)));
  }
  return result;
}

/** autoEdgeFreedom for one subject drawn `width` × `height`, cached per mask: prompt edits re-resolve the inputs. */
function heldEdgeFreedom({ bounds, mask }: HeldSubject, width: number, height: number): number {
  const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}:${width}x${height}`;
  const cached = mask && heldCache.get(mask.data)?.get(key);
  if (cached !== undefined) return cached;
  // City-block distance to the nearest pixel outside the subject: the tapered GrowMask's 3 × 3 cross erodes one step of
  // it per pixel of edge freedom, so a pixel survives e px of edge freedom if its depth is above e.
  const depth = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = Math.floor(bounds.y + (y + .5) * bounds.height / height) * (mask?.width ?? 0);
    for (let x = 0; x < width; x++) depth[y * width + x] = !mask || mask.data[row + Math.floor(bounds.x + (x + .5) * bounds.width / width)] ? 1 : 0;
  }
  for (let y = 0, i = 0; y < height; y++) for (let x = 0; x < width; x++, i++)
    if (depth[i]) depth[i] = 1 + Math.min(y ? depth[i - width] : 0, x ? depth[i - 1] : 0);
  for (let y = height - 1, i = depth.length - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--, i--)
    if (depth[i]) depth[i] = Math.min(depth[i], 1 + Math.min(y < height - 1 ? depth[i + width] : 0, x < width - 1 ? depth[i + 1] : 0));
  /** How many tokens survive e px of edge freedom wherever the grid falls: 2, 1 or 0. */
  const tokens = (e: number) => {
    // A summed-area table of the surviving pixels finds a window they fill.
    const stride = width + 1, sums = new Uint32Array(stride * (height + 1));
    for (let y = 0; y < height; y++) for (let x = 0, run = 0; x < width; x++) {
      run += depth[y * width + x] > e ? 1 : 0;
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + run;
    }
    const fills = ([rows, columns]: readonly [number, number]) => {
      for (let y = rows; y <= height; y++) for (let x = columns; x <= width; x++)
        if (sums[y * stride + x] - sums[(y - rows) * stride + x] - sums[y * stride + x - columns] + sums[(y - rows) * stride + x - columns] === rows * columns) return true;
      return false;
    };
    return TWO_TOKENS.some(fills) ? 2 : ONE_TOKEN.some(fills) ? 1 : 0;
  };
  const target = tokens(EDGE_FREEDOM.min);
  let result: number = EDGE_FREEDOM.min;
  if (target) for (let e: number = EDGE_FREEDOM.default; e > EDGE_FREEDOM.min; e -= EDGE_FREEDOM.step) if (tokens(e) >= target) { result = e; break; }
  if (mask) {
    const entries = heldCache.get(mask.data) ?? new Map<string, number>();
    heldCache.set(mask.data, entries.set(key, result));
  }
  return result;
}
const dimensionSchema = videoDimensionSchema;
const seedSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
/** Sent as the `request` field of a multipart upload alongside the reference, mask and start-frame files. */
export const animateRequestSchema = z.object({
  imageId: idSchema, maskId: idSchema, plateId: idSchema,
  width: dimensionSchema, height: dimensionSchema, frames: frameCountSchema,
  prompt: z.string().trim().min(1).max(4000),
  lockIn: z.number().int().min(LOCK_IN.min).max(LOCK_IN.max),
  edgeFreedom: z.number().int().min(EDGE_FREEDOM.min).max(EDGE_FREEDOM.max),
  seed: seedSchema.optional(),
});
export type AnimateRequest = z.infer<typeof animateRequestSchema>;
export const animationResultSchema = z.object({
  imageId: idSchema, maskId: idSchema, plateId: idSchema,
  video: z.object({ id: idSchema, url: z.string() }),
  width: dimensionSchema, height: dimensionSchema, frames: frameCountSchema,
  prompt: z.string(), lockIn: z.number().int(), edgeFreedom: z.number().int(), seed: seedSchema,
});
export type AnimationResult = z.infer<typeof animationResultSchema>;
/**
 * A reference image for inpainting, made by Qwen Image: an `object` from its description, or a `frame` of the source
 * video edited to show the description inside the mask. A frame is sent as the `request` field of a multipart upload
 * alongside the `image` and `mask` PNGs; an object needs no files.
 */
export const referenceRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("object"), videoId: idSchema, description: z.string().trim().min(1).max(500), seed: seedSchema.optional() }),
  z.object({ kind: z.literal("frame"), videoId: idSchema, description: z.string().trim().min(1).max(500),
    frame: z.number().int().min(0).max(242), seed: seedSchema.optional() }),
]);
export type ReferenceRequest = z.infer<typeof referenceRequestSchema>;
export const referenceResultSchema = z.object({
  videoId: idSchema, kind: z.enum(["object", "frame"]), description: z.string(),
  frame: z.number().int().nonnegative().nullable(), image: imageAssetSchema, seed: seedSchema,
});
export type ReferenceResult = z.infer<typeof referenceResultSchema>;
export const jobSnapshotSchema = z.object({
  id: idSchema,
  status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  message: z.string(), progress: z.number().min(0).max(1).nullable(),
  candidates: z.array(maskCandidateSchema), error: z.string().nullable(),
  stage: z.enum(["segment", "describe", "isolate", "animate", "inpaint", "track", "reference"]).optional(),
  isolation: isolationResultSchema.optional(),
  animation: animationResultSchema.optional(),
  inpainting: inpaintResultSchema.optional(),
  tracking: trackResultSchema.optional(),
  reference: referenceResultSchema.optional(),
  imageId: idSchema.optional(), maskId: idSchema.optional(),
});
export type JobSnapshot = z.infer<typeof jobSnapshotSchema>;
export const selectionRequestSchema = z.object({
  imageId: idSchema, candidateIds: z.array(idSchema).min(1).max(16),
});
export const selectionResultSchema = z.object({ mask: imageAssetSchema });
export const healthSchema = z.object({ server: z.literal("ok"), comfy: z.enum(["ok", "unavailable"]), poll: z.boolean().default(true) });
