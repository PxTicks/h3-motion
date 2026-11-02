import { useEffect, useId, useState } from "react";
import { Box, Button, Checkbox, Chip, IconButton, LinearProgress, Portal, Stack, TextField, Typography } from "@mui/material";
import { canApplyRefinement, hasPendingPoints } from "./useSelectionStore";
import { useSelectionContext } from "./SelectionContext";

/** What the panel asks for and does with the ticked subjects. */
export interface SelectPanelText { title: string; hint: string; continueLabel(count: number): string; emptyLabel: string }
const MOVE_TEXT: SelectPanelText = {
  title: "What do you want to move?", hint: "Name a subject or click one in the photo.",
  continueLabel: count => `Continue with ${count} ${count === 1 ? "subject" : "subjects"} →`, emptyLabel: "Tick subjects to animate",
};

/** Edits the selection in context. Continuing confirms it for the photo workflow, unless `onContinue` takes the ticked subjects. */
export function SelectPanel({ text = MOVE_TEXT, onContinue, example = false }: { text?: SelectPanelText; onContinue?: () => void; example?: boolean }) {
  const useSelectionStore = useSelectionContext();
  const s = useSelectionStore();
  const [hintDismissed, setHintDismissed] = useState(false);
  const hintId = useId();
  const showHint = example && !hintDismissed && !!s.image && !s.busy && s.selectionView === "find"
    && !s.text && !s.positive.length && !s.negative.length;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (showHint && event.key === "Escape") setHintDismissed(true);
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "z") return;
      if (event.target instanceof Element && event.target.closest('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      const state = useSelectionStore.getState();
      const previous = state.history.at(-1);
      if (state.busy || state.phase !== 0 || !previous) return;
      if (state.editorStart && (previous.selectionView !== state.selectionView || previous.activeId !== state.activeId)) return;
      event.preventDefault();
      state.undo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [useSelectionStore, showHint]);
  const pending = hasPendingPoints(s);
  const subjects = s.selectionView === "subjects";
  const editing = s.selectionView === "edit";
  const adding = s.selectionView === "add";
  const activeName = s.activeId ? s.labels[s.activeId] ?? "Subject" : "New subject";

  return <Stack spacing={2.5}>
    {subjects ? <>
      <Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h2">Subjects</Typography>
          <Button size="small" disabled={!s.image || s.busy} onClick={s.addSubject}>+ Add subject</Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">{s.selectedIds.length} included</Typography>
        {s.candidates.length > 1 && <Button size="small" disabled={s.busy || s.selectedIds.length === s.candidates.length} onClick={s.includeAll}>Include all {s.candidates.length}</Button>}
        {s.candidates.map((candidate, index) => {
          const name = s.labels[candidate.id] ?? `Subject ${index + 1}`;
          const { bounds } = candidate;
          return <Stack key={candidate.id} direction="row" alignItems="center" spacing={1}
            onMouseEnter={() => s.setHoveredId(candidate.id)} onMouseLeave={() => s.setHoveredId(null)}
            sx={{ p: 0.5, border: "1px solid", borderColor: s.hoveredId === candidate.id ? "text.primary" : "divider", borderRadius: 1 }}>
            <Checkbox checked={s.selectedIds.includes(candidate.id)} disabled={s.busy} onChange={() => s.toggleCandidate(candidate.id)} inputProps={{ "aria-label": `Include ${name}` }} />
            <Box component="svg" viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} aria-hidden="true" sx={{ width: 44, height: 44, flexShrink: 0, borderRadius: 0.5, bgcolor: "background.default" }}>
              <image href={s.image?.url} width={s.image?.width} height={s.image?.height} />
            </Box>
            <Stack sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" noWrap>{index + 1}. {name}</Typography>
              {s.drafts[candidate.id]?.pointsPending && <Typography variant="caption" color="text.secondary">Unapplied points</Typography>}</Stack>
            <Chip component="button" type="button" size="small" label="Refine mask" variant="outlined" disabled={s.busy}
              aria-label={`Refine mask for ${name}`} onClick={() => s.editSubject(candidate.id)} />
            <IconButton size="small" disabled={s.busy} aria-label={`Delete ${name}`} onClick={() => s.deleteSubject(candidate.id)}>×</IconButton>
          </Stack>;
        })}
      </Stack>
      {pending && <Typography variant="caption" role="status">Edit subjects with unapplied points to apply or clear them before continuing.</Typography>}
      <Button variant="contained" size="large" disabled={!s.selectedIds.length || s.busy || pending} onClick={() => onContinue ? onContinue() : void s.confirm()}>{s.selectedIds.length ? text.continueLabel(s.selectedIds.length) : text.emptyLabel}</Button>
    </> : <>
      <Stack spacing={1}>
        <Typography variant="h2">{editing ? `Edit ${activeName}` : adding && s.candidates.length ? "Add subject" : text.title}</Typography>
        <Typography variant="body2" color="text.secondary">{editing ? "Click to include more of this subject. Right-click to exclude. Other subjects stay in place." : text.hint}</Typography>
      </Stack>
      {!editing && <Stack component="form" spacing={1.5} onSubmit={event => { event.preventDefault(); void s.segment(); }}>
        {showHint && <Portal><Box aria-hidden="true" sx={{ position: "fixed", inset: 0, bgcolor: "rgba(0, 0, 0, .3)",
          zIndex: theme => theme.zIndex.modal, pointerEvents: "none" }} /></Portal>}
        <Box sx={{ position: "relative", ...(showHint && { zIndex: theme => theme.zIndex.modal + 1,
          bgcolor: "background.paper", borderRadius: 1, outline: "2px solid", outlineColor: "primary.main",
          boxShadow: "0 0 0 6px rgba(242, 255, 89, .12)" }) }}>
          <TextField label="Find subjects" placeholder="e.g. red car" value={s.text}
            onChange={event => { setHintDismissed(true); s.setText(event.target.value); }}
            disabled={!s.image || s.busy} inputProps={{ maxLength: 160, "aria-describedby": showHint ? hintId : undefined }} fullWidth />
          {showHint && <Box sx={{ position: "absolute", top: "100%", left: 0, right: 0, mt: 2,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, pl: 2, pr: 1, py: 1,
            bgcolor: "primary.main", color: "primary.contrastText", borderRadius: 1, boxShadow: 4,
            "&::before": { content: '""', position: "absolute", top: -6, left: 24, width: 12, height: 12,
              bgcolor: "primary.main", transform: "rotate(45deg)" } }}>
            <Typography id={hintId} role="status" variant="body2" sx={{ fontWeight: 600 }}>try typing 'ufo'</Typography>
            <IconButton size="small" aria-label="Dismiss typing hint" onClick={() => setHintDismissed(true)} sx={{ color: "inherit" }}>×</IconButton>
          </Box>}
        </Box>
        <Button type="submit" variant="outlined" disabled={!s.image || s.busy || (s.pointsPending ? !canApplyRefinement(s) : !s.text.trim())}>Find subjects</Button>
      </Stack>}
      {(editing || adding) && <Stack spacing={1.5}>
        {editing && <Button variant="contained" disabled={!canApplyRefinement(s)} onClick={() => void s.applyRefinement()}>Apply points</Button>}
        {(s.positive.length > 0 || s.negative.length > 0) && <Button disabled={s.busy} onClick={s.clearPoints}>Clear points</Button>}
        {s.pointsPending && !s.busy && !s.positive.length && s.negative.length > 0 && !canApplyRefinement(s) && <Typography variant="caption">Add at least one include point to define this subject.</Typography>}
        {editing && s.pointsPending && !s.positive.length && !s.negative.length && <Typography variant="caption">{s.recipes[s.activeId ?? ""]?.base === null ? "Apply removes this subject, which was created from points." : "Apply restores this subject's starting mask."}</Typography>}
      </Stack>}
    </>}
    {s.busy && s.job && <Stack spacing={1} aria-live="polite"><Typography variant="body2">{s.job.message}</Typography>
      <LinearProgress variant={s.job.progress === null ? "indeterminate" : "determinate"} value={(s.job.progress ?? 0) * 100} />
      <Button onClick={() => void s.cancel()}>Cancel selection</Button></Stack>}
  </Stack>;
}
