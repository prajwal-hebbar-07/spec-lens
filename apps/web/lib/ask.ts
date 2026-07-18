import { spawn } from "node:child_process";
import { sessionLocation } from "@/lib/claude";
import type { Provider } from "@/lib/dashboard";

const ASK_TIMEOUT_MS = 180_000;
const MAX_OUTPUT = 16 * 1024 * 1024;
const CLAUDE_BIN = process.env.SPEC_LENS_CLAUDE_BIN ?? "claude";
const CODEX_BIN = process.env.SPEC_LENS_CODEX_BIN ?? "codex";

export interface AskInput {
  provider: Provider;
  /** Account key (login email for Claude; ignored for Codex). */
  account: string;
  /** Session id of the chat that produced the plan. */
  chatId: string;
  question: string;
  /** Optional selected plan text the question is about. */
  selection?: string;
}

export type AskResult = { answer: string } | { error: string };

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

/** Run a CLI with stdin closed (so it never blocks waiting for piped input). */
export function runCli(
  bin: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; cwd?: string },
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: opts.env ?? process.env,
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, ASK_TIMEOUT_MS);
    child.stdout.on("data", (d) => {
      stdout += d;
      if (stdout.length > MAX_OUTPUT) child.kill("SIGKILL");
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    });
  });
}

/** Frame the question as a read-only plan discussion (the /plan-ask discipline). */
function buildPrompt(question: string, selection?: string): string {
  const parts = [
    "Answer a question about the plan from this conversation. This is a read-only " +
      "discussion: explain the reasoning, tradeoffs, and risks behind the plan's " +
      "decisions. Do NOT edit any files, write code, or implement anything — just " +
      "answer directly and concisely.",
  ];
  if (selection?.trim()) {
    parts.push(`\nThe question is about this part of the plan:\n"""\n${selection.trim()}\n"""`);
  }
  parts.push(`\nQuestion: ${question.trim()}`);
  return parts.join("\n");
}

export async function askPlan(input: AskInput): Promise<AskResult> {
  const question = input.question?.trim();
  if (!question) return { error: "question is required" };
  if (!input.chatId) return { error: "no chat selected" };
  const prompt = buildPrompt(question, input.selection);
  return input.provider === "codex"
    ? askCodex(input.chatId, prompt)
    : askClaude(input.account, input.chatId, prompt);
}

function failure(res: RunResult): string {
  if (res.timedOut) return "The request timed out.";
  return (res.stderr || `exited with code ${res.code}`).trim().slice(0, 500);
}

/** Resume the Claude plan session in a fork (original untouched) under plan mode. */
async function askClaude(email: string, chatId: string, prompt: string): Promise<AskResult> {
  const loc = await sessionLocation(email, chatId);
  if (!loc) return { error: "Could not locate that chat's Claude session." };
  try {
    const res = await runCli(
      CLAUDE_BIN,
      [
        "--print",
        "--resume",
        chatId,
        "--fork-session",
        "--permission-mode",
        "plan",
        "--output-format",
        "text",
        prompt,
      ],
      {
        env: { ...process.env, CLAUDE_CONFIG_DIR: loc.configDir },
        // --resume only finds a session from its original working directory.
        cwd: loc.cwd ?? undefined,
      },
    );
    const answer = res.stdout.trim();
    if (answer) return { answer };
    return { error: failure(res) || "The chat returned an empty answer." };
  } catch (e) {
    return { error: (e as Error).message?.slice(0, 500) ?? "Failed to run claude" };
  }
}

/**
 * Extract the final agent message from `codex exec` human output, which prints
 * the answer between a lone `codex` line and the trailing `tokens used` line.
 */
function parseCodexAnswer(stdout: string): string {
  const lines = stdout.split("\n");
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]?.trim() === "codex") {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return stdout.trim();
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (lines[i]?.trim().toLowerCase().startsWith("tokens used")) break;
    out.push(lines[i] ?? "");
  }
  return out.join("\n").trim();
}

/** Resume the Codex session read-only (Codex has no fork; this appends a turn). */
async function askCodex(chatId: string, prompt: string): Promise<AskResult> {
  try {
    const res = await runCli(
      CODEX_BIN,
      [
        "exec",
        "resume",
        "--all", // don't filter sessions by the server's cwd
        "--skip-git-repo-check",
        "-c",
        'sandbox_mode="read-only"',
        "-c",
        'approval_policy="never"',
        chatId,
        prompt,
      ],
      {},
    );
    const answer = parseCodexAnswer(res.stdout);
    if (answer) return { answer };
    return { error: failure(res) || "The chat returned an empty answer." };
  } catch (e) {
    return { error: (e as Error).message?.slice(0, 500) ?? "Failed to run codex" };
  }
}
