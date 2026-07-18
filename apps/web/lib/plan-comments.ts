/** A parsed `@me` review marker found in a plan document. */
export interface PlanComment {
  /** Character offset of the `<!--` in the source. */
  offset: number;
  /** The full marker text, e.g. `<!-- @me: make this configurable -->`. */
  marker: string;
  /** The comment body after `@me:`. */
  text: string;
  /** A short snippet of the text preceding the marker, for display. */
  anchor: string;
}

const MARKER_RE = /<!--\s*@me:\s*([\s\S]*?)-->/gi;

/** Find every `@me` HTML-comment marker in a plan document. */
export function parsePlanComments(content: string): PlanComment[] {
  const out: PlanComment[] = [];
  for (const m of content.matchAll(MARKER_RE)) {
    const offset = m.index ?? 0;
    const before = content.slice(Math.max(0, offset - 80), offset);
    const anchor = before.split(/\r?\n/).pop()?.trim() ?? "";
    out.push({
      offset,
      marker: m[0],
      text: (m[1] ?? "").trim(),
      anchor: anchor.length > 60 ? "…" + anchor.slice(-60) : anchor,
    });
  }
  return out;
}
