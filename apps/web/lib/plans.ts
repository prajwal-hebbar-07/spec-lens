import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Directory holding plan markdown files. Defaults to the repo's `plans/` dir
 * (two levels up from the Next.js app's cwd); override with SPEC_LENS_PLANS_DIR.
 */
export function plansDir(): string {
  return process.env.SPEC_LENS_PLANS_DIR ?? path.resolve(process.cwd(), "..", "..", "plans");
}

export interface PlanFile {
  name: string;
  updatedAt: string;
}

/** Resolve a caller-supplied name to a real path inside plansDir, or null. */
function resolvePlanPath(name: string): string | null {
  const base = path.basename(name); // strip any directory components
  if (base !== name) return null;
  if (!/\.(md|markdown)$/i.test(base)) return null;
  const dir = plansDir();
  const full = path.join(dir, base);
  if (path.dirname(full) !== path.resolve(dir)) return null; // defense in depth
  return full;
}

export async function listPlans(): Promise<PlanFile[]> {
  const dir = plansDir();
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const plans: PlanFile[] = [];
  for (const e of entries) {
    if (!e.isFile() || !/\.(md|markdown)$/i.test(e.name)) continue;
    const stat = await fs.stat(path.join(dir, e.name)).catch(() => null);
    if (stat) plans.push({ name: e.name, updatedAt: new Date(stat.mtimeMs).toISOString() });
  }
  return plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function readPlan(name: string): Promise<string | null> {
  const full = resolvePlanPath(name);
  if (!full) return null;
  return fs.readFile(full, "utf8").catch(() => null);
}

/** Overwrite a plan file with new content. Returns false on invalid name/error. */
export async function writePlan(name: string, content: string): Promise<boolean> {
  const full = resolvePlanPath(name);
  if (!full) return false;
  return fs.writeFile(full, content).then(() => true).catch(() => false);
}

/** Make comment text safe to embed inside an HTML comment on a single line. */
function sanitizeComment(comment: string): string {
  return comment
    .replace(/\r?\n/g, " ") // keep the marker on one line
    .replace(/--+/g, "–") // "--" is illegal inside an HTML comment
    .replace(/>/g, "›") // avoid an early "-->" close
    .trim();
}

/**
 * Insert an `@me` review marker at `insertOffset` (typically the end offset of
 * the anchored block, from react-markdown's node.position). Returns the updated
 * document, or null if the file/offset is invalid.
 */
export async function addComment(
  name: string,
  insertOffset: number,
  comment: string,
): Promise<string | null> {
  const full = resolvePlanPath(name);
  if (!full) return null;
  const content = await fs.readFile(full, "utf8").catch(() => null);
  if (content == null) return null;

  const text = sanitizeComment(comment);
  if (!text) return null;

  const offset = Math.max(0, Math.min(insertOffset, content.length));
  const marker = ` <!-- @me: ${text} -->`;
  const updated = content.slice(0, offset) + marker + content.slice(offset);
  await fs.writeFile(full, updated);
  return updated;
}
