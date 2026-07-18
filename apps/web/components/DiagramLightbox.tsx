"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Maximize, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_IN_STEP = 1.25;
const ZOOM_OUT_STEP = 0.8;

const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * Read a Mermaid SVG's intrinsic size from its string. Prefer the viewBox
 * (`0 0 W H`); fall back to the width/height attributes. Used to size the scaled
 * wrapper so `overflow-auto` produces real scrollbars when zoomed in.
 */
function svgNaturalSize(svg: string): { width: number; height: number } {
  const viewBox = svg.match(/viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/);
  if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
  const w = svg.match(/width="([\d.]+)"/);
  const h = svg.match(/height="([\d.]+)"/);
  return { width: w ? Number(w[1]) : 800, height: h ? Number(h[1]) : 600 };
}

/**
 * A full-screen popup that shows a rendered Mermaid SVG with zoom controls and
 * native horizontal/vertical scrolling so large diagrams stay readable.
 */
export function DiagramLightbox({
  svg,
  open,
  onOpenChange,
}: {
  svg: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const natural = useMemo(() => svgNaturalSize(svg), [svg]);
  // Strip Mermaid's inline `max-width` so the SVG can grow past the column width,
  // and let it fill the scaled wrapper.
  const displaySvg = useMemo(
    () => svg.replace(/style="[^"]*max-width:[^"]*"/, 'style="width:100%;height:100%"'),
    [svg],
  );

  // Reset zoom each time the popup opens.
  useEffect(() => {
    if (open) setZoom(1);
  }, [open]);

  const zoomIn = useCallback(() => setZoom((z) => clamp(z * ZOOM_IN_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clamp(z * ZOOM_OUT_STEP)), []);
  const reset = useCallback(() => setZoom(1), []);

  // Ctrl/⌘ + wheel zooms; a plain wheel scrolls normally.
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((z) => clamp(z * (e.deltaY < 0 ? ZOOM_IN_STEP : ZOOM_OUT_STEP)));
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-md dark:bg-black/70" />
        <Dialog.Popup className="fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl outline-none sm:inset-6">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-card/80 px-3 py-2.5 sm:px-4">
            <span className="rounded-lg bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={zoomOut}
                aria-label="Zoom out"
                disabled={zoom <= MIN_ZOOM}
              >
                <ZoomOut />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={zoomIn}
                aria-label="Zoom in"
                disabled={zoom >= MAX_ZOOM}
              >
                <ZoomIn />
              </Button>
              <Button variant="outline" size="icon" onClick={reset} aria-label="Reset zoom">
                <Maximize />
              </Button>
              <Dialog.Close
                render={
                  <Button variant="outline" size="icon" aria-label="Close">
                    <X />
                  </Button>
                }
              />
            </div>
          </div>

          <div
            ref={scrollRef}
            onWheel={onWheel}
            className="flex-1 overflow-auto bg-muted/20 p-4 sm:p-6"
          >
            {/* Sizing box: occupies natural × zoom so overflow-auto shows real
                scrollbars. The inner box stays at natural size and is visually
                scaled by the transform to fill it. */}
            <div style={{ width: natural.width * zoom, height: natural.height * zoom }}>
              <div
                style={{
                  width: natural.width,
                  height: natural.height,
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                }}
                dangerouslySetInnerHTML={{ __html: displaySvg }}
              />
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
