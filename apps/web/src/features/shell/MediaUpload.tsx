import { useRef, useState } from "react";
import { Alert, Box, Button, ButtonBase, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { MAX_VIDEO_SECONDS } from "@h3-motion/shared";
import exampleImage from "../../assets/examples/ufo-landing-pads.png";
import exampleVideo from "../../assets/examples/woman-empty-palm.mp4";
import exampleVideoPoster from "../../assets/examples/woman-empty-palm.jpg";
import { useSelectionStore } from "../select";
import { useInpaintStore } from "../inpaint/useInpaintStore";

export type Workflow = "upload" | "image" | "video";
const VIDEO_EXAMPLE_PROMPT = "A tiny speck-sized dog is seen in a woman's hand, wagging its tail. She moves her hand across the screen and the dog becomes partially obscured.";
const examples = [
  { kind: "image", url: exampleImage, thumbnail: exampleImage, name: "ufo-landing-pads.png", type: "image/png", crop: "left center",
    label: "Try image example", description: "A small UFO hovering over a wooden table with three toy landing pads" },
  { kind: "video", url: exampleVideo, thumbnail: exampleVideoPoster, name: "woman-empty-palm.mp4", type: "video/mp4", crop: "center",
    label: "Try video example", description: "A woman looking at her empty palm" },
] as const;
export function mediaKind(file: Pick<File, "type" | "name">): "image" | "video" | null {
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "image";
  if (["video/mp4", "video/webm"].includes(file.type) || (!file.type && /\.(mp4|webm)$/i.test(file.name))) return "video";
  return null;
}
export function MediaUpload({ onUploaded }: { onUploaded(workflow: Workflow, example?: boolean): void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loadingExample, setLoadingExample] = useState<"image" | "video" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imageBusy = useSelectionStore(s => s.busy);
  const videoBusy = useInpaintStore(s => s.uploading);
  const busy = imageBusy || videoBusy || loadingExample !== null;
  async function upload(file: File, example = false) {
    if (busy) return;
    setError(null);
    const kind = mediaKind(file);
    if (!kind) { setError("Choose a JPEG, PNG, WebP, MP4 or WebM file."); return; }
    if (kind === "video") {
      if (await useInpaintStore.getState().upload(file)) {
        if (example) useInpaintStore.getState().setPrompt(VIDEO_EXAMPLE_PROMPT);
        onUploaded("video", example);
      }
    }
    else {
      await useSelectionStore.getState().upload(file);
      if (useSelectionStore.getState().source === file) {
        if (example) useSelectionStore.getState().setText("");
        onUploaded("image", example);
      }
    }
  }
  async function loadExample(example: typeof examples[number]) {
    if (busy) return;
    setLoadingExample(example.kind);
    setError(null);
    try {
      const response = await fetch(example.url);
      if (!response.ok) throw new Error(`Could not load the example ${example.kind}. Please try again.`);
      const file = new File([await response.blob()], example.name, { type: example.type });
      await upload(file, true);
    } catch (error) {
      setError(error instanceof Error ? error.message : `Could not load the example ${example.kind}. Please try again.`);
    } finally { setLoadingExample(null); }
  }
  return <Stack spacing={2}>
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 360px" }, gap: 3 }}>
    <Paper sx={{ p: { xs: 2, md: 3 }, display: "flex" }}>
      <Box onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void upload(file); }}
        sx={{ flex: 1, minHeight: 360, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed", borderColor: dragging ? "primary.main" : "divider", borderRadius: 1, p: 3 }}>
        <Stack spacing={2} alignItems="center" sx={{ textAlign: "center" }}>
          {busy ? <CircularProgress size={32} /> : <Typography sx={{ fontSize: 48, color: "primary.main", lineHeight: 1 }}>↥</Typography>}
          <Typography variant="h2">Upload an image or video</Typography>
          <Typography variant="body2" color="text.secondary">Image → animate a subject · Video → inpaint a moving area</Typography>
          <Button variant="contained" disabled={busy} onClick={() => input.current?.click()}>{loadingExample ? "Loading example…" : busy ? "Uploading…" : "Choose a file"}</Button>
          <Typography variant="caption" color="text.secondary">JPEG, PNG, WebP · MP4, WebM up to {MAX_VIDEO_SECONDS} s</Typography>
        </Stack>
      </Box>
    </Paper>
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">Or try a guided example</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr" }, gap: 2 }}>
      {examples.map(example => <ButtonBase key={example.kind} disabled={busy} onClick={() => void loadExample(example)} aria-label={example.label}
        sx={{ position: "relative", display: "block", borderRadius: 1, overflow: "hidden",
          bgcolor: "background.paper", border: "1px solid", borderColor: "divider", textAlign: "left", opacity: busy ? .5 : 1,
          "&:hover, &.Mui-focusVisible": { borderColor: "primary.main" },
          "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 3 } }}>
        <Box component="img" src={example.thumbnail} alt={example.description}
          sx={{ display: "block", width: "100%", aspectRatio: "4 / 3", objectFit: "cover", objectPosition: example.crop }} />
        <Box component="span" sx={{ position: "absolute", top: 0, left: 0, right: 0, bgcolor: "primary.main", color: "primary.contrastText",
          display: "flex", justifyContent: "space-between", alignItems: "center", px: 1.5, py: .75, fontSize: 14, fontWeight: 600 }}>
          {loadingExample === example.kind ? "Loading example…" : example.label}<Box component="span" aria-hidden="true">→</Box>
        </Box>
      </ButtonBase>)}
      </Box>
    </Stack>
    </Box>
    <input hidden ref={input} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" aria-label="Upload an image or video"
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
    {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
  </Stack>;
}
