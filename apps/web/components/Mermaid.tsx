"use client";

import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";
import { DiagramLightbox } from "@/components/DiagramLightbox";

mermaid.initialize({ startOnLoad: false });

/**
 * Render a Mermaid diagram from its source. On parse failure, fall back to
 * showing the raw source so one bad diagram never blanks the whole document.
 */
export function Mermaid({ chart }: { chart: string }) {
  // useId gives a stable, unique, DOM-safe id per instance.
  const id = "mermaid-" + useId().replace(/[^a-zA-Z0-9-]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, chart]);

  if (error) {
    return (
      <pre>
        <code>{chart}</code>
      </pre>
    );
  }
  if (!svg) return <div className="my-4 text-sm text-muted-foreground">Rendering diagram…</div>;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open diagram"
        className="my-4 flex w-full cursor-zoom-in justify-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <DiagramLightbox svg={svg} open={open} onOpenChange={setOpen} />
    </>
  );
}
