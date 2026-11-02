import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { Box, IconButton, Portal, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

export function ExampleBubble({ descriptionId, message, onDismiss, sx = [], ref }: {
  descriptionId: string; message: string; onDismiss: () => void; sx?: SxProps<Theme>; ref?: Ref<HTMLDivElement>;
}) {
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <Box ref={ref} sx={[{ position: "absolute", display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 1, pl: 2, pr: 1, py: 1, bgcolor: "primary.main", color: "primary.contrastText", borderRadius: 1, boxShadow: 4,
    "&::before": { content: '""', position: "absolute", top: -6, left: 24, width: 12, height: 12,
      bgcolor: "primary.main", transform: "rotate(45deg)" } }, ...(Array.isArray(sx) ? sx : [sx])]}>
    <Typography id={descriptionId} role="status" variant="body2" sx={{ fontWeight: 600 }}>{message}</Typography>
    <IconButton size="small" aria-label="Dismiss example hint" onClick={onDismiss} sx={{ color: "inherit", pointerEvents: "auto" }}>×</IconButton>
  </Box>;
}

export function ExampleBackdrop() {
  return <Portal><Box aria-hidden="true" sx={{ position: "fixed", inset: 0, bgcolor: "rgba(0, 0, 0, .3)",
    zIndex: theme => theme.zIndex.modal, pointerEvents: "none" }} /></Portal>;
}

export function ExampleHint({ active, descriptionId, message, onDismiss, pill = false, dim = true, reserveSpace = false, children }: {
  active: boolean; descriptionId: string; message: string; onDismiss: () => void; pill?: boolean;
  dim?: boolean; reserveSpace?: boolean; children: ReactNode;
}) {
  return <>
    {active && dim && <ExampleBackdrop />}
    <Box sx={{ position: "relative", ...(active && { zIndex: theme => theme.zIndex.modal + 1 }) }}>
      <Box sx={active ? { bgcolor: "background.paper", borderRadius: pill ? 999 : 1, outline: "2px solid",
        outlineColor: "primary.main", boxShadow: "0 0 0 6px rgba(242, 255, 89, .12)" } : undefined}>
        {children}
      </Box>
      {active && <ExampleBubble descriptionId={descriptionId} message={message} onDismiss={onDismiss}
        sx={{ position: reserveSpace ? "relative" : "absolute", top: reserveSpace ? "auto" : "100%", left: 0, right: 0, mt: 2 }} />}
    </Box>
  </>;
}
