import { useMemo } from "react";
import { autoEdgeFreedom, buildH3PromptFields, composeH3Prompt, describeMotion, videoGeometry } from "@h3-motion/shared";
import type { VideoTier, FrameSize, H3PromptFields, ImageAsset, IsolationResult, Rect, SubjectMotion } from "@h3-motion/shared";
import { currentIsolation, useSelectionStore } from "../select";
import { layersKeyOf, subjectKeyOf, useMotionStore } from "../motion";
import type { MotionSubject, SubjectLayers } from "../motion";

export type Tier = VideoTier;
interface Parts {
  image: ImageAsset | null; mask: ImageAsset | null; isolation: IsolationResult | null;
  motion: SubjectMotion | null; subjectKey: string | null; bounds: Rect | null;
  layers: SubjectLayers | null; layersKey: string | null; tier: Tier; prompt: string | null;
  /** Null follows the subject's size: see autoEdgeFreedom. */
  edgeFreedom: number | null;
  subjects: MotionSubject[];
  soundEffects?: string | null; music?: string;
  /** The whole prompt as written in raw mode, sent instead of the fields; null in formatted mode. */
  rawPrompt?: string | null;
}
type PromptSettings = Pick<Parts, "tier" | "edgeFreedom" | "prompt" | "soundEffects" | "music" | "rawPrompt">;
export interface GenerationInputs {
  image: ImageAsset; mask: ImageAsset; isolation: IsolationResult; motion: SubjectMotion; layers: SubjectLayers;
  size: FrameSize; autoPrompt: string; prompt: string;
  /** The edge freedom sent: the chosen one, or the automatic one if none is chosen. */
  edgeFreedom: number; autoEdgeFreedom: number;
  promptFields: H3PromptFields;
  /** Changes whenever anything that affects the video changes, except the seed. */
  signature: string;
  subjects: MotionSubject[];
}

export function resolveInputs(parts: Parts): GenerationInputs | null {
  const { image, mask, isolation, layers, subjects } = parts;
  const motion = subjects[0]?.motion ?? parts.motion;
  if (!image || !mask || !isolation || !motion || !layers || parts.subjectKey !== subjectKeyOf(image.id, mask.id)
    || parts.layersKey !== layersKeyOf(image.url, mask.url, isolation.plate.url)) return null;
  const { output: size, generation } = videoGeometry(image, parts.tier);
  const held = subjects.length ? subjects.map(({ layers, motion }) => ({ bounds: layers.bounds, motion, mask: layers.mask && { data: layers.mask, width: layers.width } }))
    : [{ bounds: parts.bounds ?? layers.bounds, motion, mask: layers.mask && { data: layers.mask, width: layers.width } }].filter(subject => subject.bounds);
  const auto = autoEdgeFreedom(held, layers, generation), edgeFreedom = parts.edgeFreedom ?? auto;
  const caption = isolation.caption;
  const automatic = subjects.length > 1
    ? buildH3PromptFields({ ...caption, subject: "the subjects" }, `move independently: ${subjects.map(subject =>
      `${subject.name} ${describeMotion(subject.motion, subject.layers, "moves", subject.layers.bounds)}`).join("; ")}`)
    : buildH3PromptFields(caption, describeMotion(motion, layers, caption.motion_verb, subjects[0]?.layers.bounds ?? parts.bounds ?? undefined));
  const autoPrompt = composeH3Prompt(automatic);
  const promptFields = { mainPrompt: parts.prompt?.trim() || automatic.mainPrompt,
    soundEffects: parts.soundEffects ?? automatic.soundEffects, music: parts.music ?? "" };
  const prompt = parts.rawPrompt == null ? composeH3Prompt(promptFields) : parts.rawPrompt.trim();
  const signature = JSON.stringify([image.id, mask.id, isolation.plate.id,
    subjects.length ? subjects.map(subject => [subject.id, subject.motion]) : motion, size, edgeFreedom, prompt]);
  const renderLayers = subjects.length ? { ...layers, subjects: subjects.map(subject => ({ layers: subject.layers, motion: subject.motion })) } : layers;
  return { image, mask, isolation, motion, layers: renderLayers, subjects, size, edgeFreedom, autoEdgeFreedom: auto, autoPrompt, promptFields, prompt, signature };
}

export function currentParts(settings: PromptSettings): Parts {
  const selection = useSelectionStore.getState(), motion = useMotionStore.getState();
  return { image: selection.image, mask: selection.mask, isolation: currentIsolation(selection),
    motion: motion.motion, subjects: motion.subjects, subjectKey: motion.subjectKey, bounds: motion.bounds, layers: motion.layers, layersKey: motion.layersKey, ...settings };
}

/** `rawPrompt` is required, so a view can't resolve a different prompt, and signature, than `generate` sends. */
export function useGenerationInputs(settings: PromptSettings & { rawPrompt: string | null }): GenerationInputs | null {
  const image = useSelectionStore(s => s.image);
  const mask = useSelectionStore(s => s.mask);
  const isolation = useSelectionStore(currentIsolation);
  const motion = useMotionStore(s => s.motion);
  const subjects = useMotionStore(s => s.subjects);
  const subjectKey = useMotionStore(s => s.subjectKey);
  const bounds = useMotionStore(s => s.bounds);
  const layers = useMotionStore(s => s.layers);
  const layersKey = useMotionStore(s => s.layersKey);
  const { tier, edgeFreedom, prompt, soundEffects, music, rawPrompt } = settings;
  return useMemo(() => resolveInputs({ image, mask, isolation, motion, subjects, subjectKey, bounds, layers, layersKey, tier, edgeFreedom, prompt, soundEffects, music, rawPrompt }),
    [image, mask, isolation, motion, subjects, subjectKey, bounds, layers, layersKey, tier, edgeFreedom, prompt, soundEffects, music, rawPrompt]);
}
