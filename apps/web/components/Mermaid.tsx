"use client";

import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";

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
  return <div className="my-4 flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />;
}
