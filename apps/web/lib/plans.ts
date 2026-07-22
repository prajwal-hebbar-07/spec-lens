import { promises as fs } from "node:fs";
import path from "node:path";
import { runCli } from "@/lib/ask";
import * as codex from "@/lib/codex";
import * as claude from "@/lib/claude";
import type { Provider } from "@/lib/dashboard";

const CLAUDE_BIN = process.env.SPEC_LENS_CLAUDE_BIN ?? "claude";
const CODEX_BIN = process.env.SPEC_LENS_CODEX_BIN ?? "codex";

export interface PlanContext {
  provider: Provider;
  account: string;
  chatId: string;
}

/** The selected chat's `<workspace>/plans`, unless explicitly overridden. */
export async function plansDir(context: PlanContext): Promise<string | null> {
  if (process.env.SPEC_LENS_PLANS_DIR)
    return path.resolve(process.env.SPEC_LENS_PLANS_DIR);
  const chat =
    context.provider === "codex"
      ? await codex.getChatDetail(context.chatId)
      : await claude.getChatDetail(context.account, context.chatId);
  return chat?.cwd ? path.join(chat.cwd, "plans") : null;
}

export interface PlanFile {
  name: string;
  updatedAt: string;
}

/** Resolve a caller-supplied name to a real path inside plansDir, or null. */
function resolvePlanPath(dir: string, name: string): string | null {
  const base = path.basename(name); // strip any directory components
  if (base !== name) return null;
  if (!/\.(md|markdown)$/i.test(base)) return null;
  const root = path.resolve(dir);
  const full = path.join(root, base);
  if (path.dirname(full) !== root) return null; // defense in depth
  return full;
}

export async function listPlans(dir: string): Promise<PlanFile[]> {
  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch(() => []);
  const plans: PlanFile[] = [];
  for (const e of entries) {
    if (!e.isFile() || !/\.(md|markdown)$/i.test(e.name)) continue;
    const stat = await fs.stat(path.join(dir, e.name)).catch(() => null);
    if (stat)
      plans.push({
        name: e.name,
        updatedAt: new Date(stat.mtimeMs).toISOString(),
      });
  }
  return plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function readPlan(
  dir: string,
  name: string,
): Promise<string | null> {
  const full = resolvePlanPath(dir, name);
  if (!full) return null;
  return fs.readFile(full, "utf8").catch(() => null);
}

/** Overwrite a plan file with new content. Returns false on invalid name/error. */
export async function writePlan(
  dir: string,
  name: string,
  content: string,
): Promise<boolean> {
  const full = resolvePlanPath(dir, name);
  if (!full) return false;
  return fs
    .writeFile(full, content)
    .then(() => true)
    .catch(() => false);
}

export async function createPlan(
  dir: string,
  name: string,
  content: string,
): Promise<"created" | "exists" | "error"> {
  const full = resolvePlanPath(dir, name);
  if (!full) return "error";
  await fs.mkdir(dir, { recursive: true }).catch(() => undefined);
  return fs
    .writeFile(full, content, { flag: "wx" })
    .then(() => "created" as const)
    .catch((error: NodeJS.ErrnoException) =>
      error.code === "EEXIST" ? "exists" : "error",
    );
}

export type ReviewResult =
  { content: string; remainingComments: number } | { error: string };

export interface ReviewInput {
  name: string;
  provider: Provider;
  account: string;
  chatId: string;
}

/** Resolve comments using the provider session selected for this plan. */
export async function reviewPlan(input: ReviewInput): Promise<ReviewResult> {
  const dir = await plansDir(input);
  if (!dir) return { error: "chat workspace not found" };
  const full = resolvePlanPath(dir, input.name);
  if (!full || !(await fs.stat(full).catch(() => null)))
    return { error: "plan not found" };

  const prompt = `Use the plan-review skill to resolve every inline @me review comment in ${JSON.stringify(full)}. Only edit that plan document; do not implement code changes.`;
  const location =
    input.provider === "claude"
      ? await claude.sessionLocation(input.account, input.chatId)
      : null;
  if (input.provider === "claude" && !location) {
    return { error: "Could not locate that chat's Claude session." };
  }

  const result = await runCli(
    input.provider === "claude" ? CLAUDE_BIN : CODEX_BIN,
    input.provider === "claude"
      ? [
          "--print",
          "--resume",
          input.chatId,
          "--fork-session",
          "--permission-mode",
          "acceptEdits",
          "--add-dir",
          dir,
          "--output-format",
          "text",
          prompt,
        ]
      : [
          "exec",
          "resume",
          "--all",
          "--skip-git-repo-check",
          "-c",
          'sandbox_mode="workspace-write"',
          "-c",
          'approval_policy="never"',
          input.chatId,
          prompt,
        ],
    input.provider === "claude"
      ? {
          env: { ...process.env, CLAUDE_CONFIG_DIR: location!.configDir },
          cwd: location!.cwd ?? dir,
        }
      : { cwd: dir },
  ).catch((error: Error) => ({ error: error.message }));

  if ("error" in result) return { error: result.error.slice(0, 500) };
  if (result.timedOut) return { error: "The review timed out." };
  if (result.code !== 0) {
    return {
      error: (result.stderr || `Codex exited with code ${result.code}`)
        .trim()
        .slice(0, 500),
    };
  }

  const content = await fs.readFile(full, "utf8").catch(() => null);
  if (content == null) return { error: "Could not reload the reviewed plan." };
  return {
    content,
    remainingComments: content.match(/<!--\s*@me:/gi)?.length ?? 0,
  };
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
  dir: string,
  name: string,
  insertOffset: number,
  comment: string,
): Promise<string | null> {
  const full = resolvePlanPath(dir, name);
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
