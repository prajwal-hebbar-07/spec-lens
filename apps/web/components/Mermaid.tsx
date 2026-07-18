"use client";

import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";
import { DiagramLightbox } from "@/components/DiagramLightbox";

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
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setThemeVersion((version) => version + 1);
    window.addEventListener("themechange", refresh);
    return () => window.removeEventListener("themechange", refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const dark = document.documentElement.classList.contains("dark");
    setSvg(null);
    setError(false);
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      themeVariables: dark
        ? {
            background: "#232334",
            primaryColor: "#34324e",
            primaryTextColor: "#eceaf3",
            primaryBorderColor: "#aaa0ed",
            lineColor: "#aaa0ed",
            secondaryColor: "#244039",
            tertiaryColor: "#443625",
          }
        : {
            background: "#fbfaf5",
            primaryColor: "#ebe8ff",
            primaryTextColor: "#292739",
            primaryBorderColor: "#8175c9",
            lineColor: "#8175c9",
            secondaryColor: "#dff3ea",
            tertiaryColor: "#fff0cf",
          },
    });
    mermaid
      .render(`${id}-${themeVersion}`, chart)
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, chart, themeVersion]);

  if (error) {
    return (
      <pre>
        <code>{chart}</code>
      </pre>
    );
  }
  if (!svg) {
    return (
      <div className="my-5 flex min-h-32 items-center justify-center rounded-xl border border-dashed border-border bg-muted/25 text-sm text-muted-foreground">
        Rendering diagram…
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open diagram"
        className="my-5 flex w-full cursor-zoom-in justify-center overflow-hidden rounded-xl border border-border/70 bg-background/50 p-4 shadow-inner outline-none transition hover:border-primary/35 focus-visible:ring-3 focus-visible:ring-ring/30"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <DiagramLightbox svg={svg} open={open} onOpenChange={setOpen} />
    </>
  );
}
