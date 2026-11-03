import { useId, useState } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, LinearProgress, Slider, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { EDGE_FREEDOM } from "@h3-motion/shared";
import { useGenerationInputs } from "./inputs";
import { useCurrentResult, useGenerateStore, usePromptSettings } from "./useGenerateStore";
import { PromptModeToggle } from "../shell/PromptModeToggle";
import { ExampleBackdrop, ExampleHint } from "../../components/ExampleHint";

const EDGE_FREEDOM_HELP = "How far inside its outline the subject is released from your animation. More freedom lets the model redraw the subject's edges, which helps when part of it is cut off, such as an arm reaching in from off-screen. Automatic by default: small subjects get less, so enough of them stays held to follow the path.";

export function GeneratePanel({ example = false }: { example?: boolean }) {
  const [promptHintDismissed, setPromptHintDismissed] = useState(false);
  const [generateHintDismissed, setGenerateHintDismissed] = useState(false);
  const promptHintId = useId();
  const generateHintId = useId();
  const edgeFreedom = useGenerateStore(s => s.edgeFreedom);
  const seed = useGenerateStore(s => s.seed);
  const prompt = useGenerateStore(s => s.prompt);
  const soundEffects = useGenerateStore(s => s.soundEffects);
  const music = useGenerateStore(s => s.music);
  const promptMode = useGenerateStore(s => s.promptMode);
  const rawPrompt = useGenerateStore(s => s.rawPrompt);
  const unformattable = useGenerateStore(s => s.unformattable);
  const status = useGenerateStore(s => s.status);
  const progress = useGenerateStore(s => s.progress);
  const job = useGenerateStore(s => s.job);
  const error = useGenerateStore(s => s.error);
  const notice = useGenerateStore(s => s.notice);
  const { setEdgeFreedom, setSeed, setPrompt, setSoundEffects, setMusic, setPromptMode, setRawPrompt, resetPrompt, keepRawPrompt,
    generate, cancel, clearError } = useGenerateStore.getState();
  const inputs = useGenerationInputs(usePromptSettings());
  const result = useCurrentResult();
  const busy = status !== "idle";
  const showPromptHint = example && !promptHintDismissed && !busy && !!inputs && !result && promptMode === "formatted";
  const showGenerateHint = example && !generateHintDismissed && !busy && !!inputs?.prompt && !result;
  const effectiveEdgeFreedom = inputs?.edgeFreedom ?? edgeFreedom ?? EDGE_FREEDOM.default;
  const statusText = status === "rendering" ? `Rendering motion frames… ${Math.round((progress ?? 0) * 100)}%`
    : status === "uploading" ? "Uploading the motion videos…" : job?.message ?? "Waiting for ComfyUI…";

  return <Stack spacing={2.5}>
    {(showPromptHint || showGenerateHint) && <ExampleBackdrop />}
    <Stack spacing={1}>
      <Typography variant="h2">Bring it to life</Typography>
      <Typography variant="body2" color="text.secondary">Write a detailed prompt to bring your animation to life.</Typography>
    </Stack>
    {promptMode === "raw" ? <TextField multiline minRows={12} label="Raw prompt" value={rawPrompt} disabled={busy || !inputs}
      onChange={event => setRawPrompt(event.target.value)} slotProps={{ htmlInput: { maxLength: 4000 } }}
      helperText="Sent as written, so it doesn't follow changes to the motion." /> : <>
      <ExampleHint active={showPromptHint} descriptionId={promptHintId} dim={false} reserveSpace
        message="The prompt fills in automatically, but editing it is recommended to correct issues or add details."
        onDismiss={() => setPromptHintDismissed(true)}>
        <TextField multiline minRows={6} fullWidth label="Main prompt" value={prompt ?? inputs?.promptFields.mainPrompt ?? ""} disabled={busy || !inputs}
          onChange={event => { setPromptHintDismissed(true); setPrompt(event.target.value); }}
          slotProps={{ htmlInput: { maxLength: 3000, "aria-describedby": showPromptHint ? promptHintId : undefined } }} />
      </ExampleHint>
      <TextField multiline minRows={3} label="Sound effects [Optional]" value={soundEffects ?? inputs?.promptFields.soundEffects ?? ""} disabled={busy || !inputs}
        onChange={event => setSoundEffects(event.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
      <TextField multiline minRows={3} label="Music [Optional]" value={music} disabled={busy || !inputs}
        onChange={event => setMusic(event.target.value)} slotProps={{ htmlInput: { maxLength: 250 } }} />
    </>}
    {busy ? <Stack spacing={1} aria-live="polite">
      <Typography variant="body2">{statusText}</Typography>
      <LinearProgress variant={progress == null ? "indeterminate" : "determinate"} value={(progress ?? 0) * 100} />
      <Typography variant="caption" color="text.secondary">Generation usually takes several minutes. Keep this tab open.</Typography>
      <Button onClick={() => void cancel()}>Cancel</Button>
    </Stack> : <ExampleHint active={showGenerateHint} descriptionId={generateHintId} message="Click me!"
      onDismiss={() => setGenerateHintDismissed(true)} dim={false} reserveSpace pill>
      <Button variant="contained" size="large" fullWidth disabled={!inputs?.prompt}
        aria-describedby={showGenerateHint ? generateHintId : undefined} onClick={() => {
          setPromptHintDismissed(true);
          setGenerateHintDismissed(true);
          void generate();
        }} sx={{ minHeight: 56, fontFamily: "Barlow Condensed, sans-serif", fontSize: 22, letterSpacing: ".14em" }}>GENERATE</Button>
    </ExampleHint>}
    {error && <Alert severity="error" onClose={clearError}>{error}</Alert>}
    {notice && !busy && <Typography role="status" variant="body2" color="text.secondary">{notice}</Typography>}
    {result && <Stack spacing={1}>
      <Typography variant="overline" color="text.secondary">Output</Typography>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Button variant="outlined" component="a" href={result.video.url} download="h3-motion.mp4">Download video</Button>
        <Button disabled={busy} onClick={() => setSeed(String(result.seed))}>Reuse seed</Button>
      </Stack>
    </Stack>}
    <Accordion disableGutters elevation={0} sx={{ bgcolor: "transparent", border: "1px solid", borderColor: "divider", borderRadius: 1, "&::before": { display: "none" } }}>
      <AccordionSummary expandIcon={<Typography color="text.secondary">▾</Typography>}><Typography variant="overline">Advanced</Typography></AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2.5}>
          <PromptModeToggle mode={promptMode} unformattable={unformattable} disabled={busy || !inputs}
            onChange={setPromptMode} onReset={resetPrompt} onKeep={keepRawPrompt} />
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Tooltip title={EDGE_FREEDOM_HELP} placement="top-start">
                <Typography variant="caption" color="text.secondary" tabIndex={0} sx={{ cursor: "help" }}>Edge freedom ⓘ</Typography>
              </Tooltip>
              <Stack direction="row" alignItems="center" gap={1}>
                {edgeFreedom === null ? <Typography variant="caption" color="text.secondary">Auto</Typography>
                  : <Button size="small" disabled={busy} onClick={() => setEdgeFreedom(null)} sx={{ minWidth: 0, py: 0 }}>Use auto</Button>}
                <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>{effectiveEdgeFreedom} px</Typography>
              </Stack>
            </Stack>
            <Slider value={effectiveEdgeFreedom} min={EDGE_FREEDOM.min} max={EDGE_FREEDOM.max} step={EDGE_FREEDOM.step} disabled={busy} aria-label="Edge freedom"
              onChange={(_, value) => setEdgeFreedom(Array.isArray(value) ? value[0] : value)} />
          </Box>
          <TextField size="small" label="Seed" placeholder="Random" value={seed} disabled={busy} onChange={event => setSeed(event.target.value)}
            slotProps={{ htmlInput: { inputMode: "numeric" } }} helperText="Leave empty for a new random seed each time." />
        </Stack>
      </AccordionDetails>
    </Accordion>
  </Stack>;
}
