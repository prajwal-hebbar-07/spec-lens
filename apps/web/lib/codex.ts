import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  Account,
  ChatDetail,
  ChatSummary,
  UsageGauges,
} from "@/lib/dashboard";

const CODEX_HOME = path.join(os.homedir(), ".codex");
const SESSIONS_DIR = path.join(CODEX_HOME, "sessions");
const INDEX_FILE = path.join(CODEX_HOME, "session_index.jsonl");

/** Decode a JWT payload (no verification — local identity display only). */
function decodeJwt(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = Buffer.from(
      part.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function listAccounts(): Promise<Account[]> {
  try {
    const auth = JSON.parse(
      await fs.readFile(path.join(CODEX_HOME, "auth.json"), "utf8"),
    ) as {
      tokens?: { id_token?: string };
    };
    const claims = auth.tokens?.id_token
      ? decodeJwt(auth.tokens.id_token)
      : null;
    if (!claims?.email) return [];
    return [
      {
        provider: "codex",
        key: "codex",
        email: String(claims.email),
        displayName: claims.name ? String(claims.name) : null,
        plan: null,
        active: true,
      },
    ];
  } catch {
    return [];
  }
}

export async function listChats(limit = 60): Promise<ChatSummary[]> {
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf8");
    const rows = raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as {
            id?: string;
            thread_name?: string;
            updated_at?: string;
          };
        } catch {
          return null;
        }
      })
      .filter(
        (r): r is { id: string; thread_name?: string; updated_at?: string } =>
          !!r?.id,
      );

    return rows
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        title: r.thread_name?.trim() || "(untitled thread)",
        updatedAt: r.updated_at ?? null,
        cwd: null,
      }));
  } catch {
    return [];
  }
}

export async function getChatDetail(id: string): Promise<ChatDetail | null> {
  const file = await findRollout(id);
  if (!file) return null;
  const summary = (await listChats(500)).find((c) => c.id === id) ?? {
    id,
    title: "(thread)",
    updatedAt: null,
    cwd: null,
  };
  const info = await latestTokenInfo(file);
  const usedTokens = info?.usedTokens ?? null;
  const contextWindow = info?.contextWindow ?? null;
  const contextPct =
    usedTokens != null && contextWindow
      ? Math.min(100, (usedTokens / contextWindow) * 100)
      : null;
  return {
    ...summary,
    cwd: await rolloutCwd(file),
    contextPct,
    usedTokens,
    contextWindow,
  };
}

/** Codex embeds rate limits in each token_count event, so no bridge is needed. */
export async function getUsage(): Promise<UsageGauges> {
  const empty: UsageGauges = {
    fiveHour: null,
    sevenDay: null,
    fiveHourResetsAt: null,
    sevenDayResetsAt: null,
    updatedAt: null,
  };
  const newest = await newestRollout();
  if (!newest) return empty;
  const info = await latestTokenInfo(newest.file);
  return info?.usage ?? empty;
}

// ---- internals ----------------------------------------------------------

async function allRollouts(): Promise<{ file: string; mtime: number }[]> {
  const out: { file: string; mtime: number }[] = [];
  async function walk(dir: string) {
    const entries = await fs
      .readdir(dir, { withFileTypes: true })
      .catch(() => []);
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && /^rollout-.*\.jsonl$/.test(e.name)) {
        const stat = await fs.stat(full).catch(() => null);
        if (stat) out.push({ file: full, mtime: stat.mtimeMs });
      }
    }
  }
  await walk(SESSIONS_DIR);
  return out;
}

async function newestRollout(): Promise<{
  file: string;
  mtime: number;
} | null> {
  const rollouts = await allRollouts();
  return rollouts.sort((a, b) => b.mtime - a.mtime)[0] ?? null;
}

/** Rollout filenames end with the thread uuid: rollout-<ts>-<uuid>.jsonl. */
async function findRollout(id: string): Promise<string | null> {
  const rollouts = await allRollouts();
  return rollouts.find((r) => r.file.includes(id))?.file ?? null;
}

export function sessionCwd(raw: string): string | null {
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as {
        type?: string;
        payload?: { cwd?: unknown };
      };
      if (row.type === "session_meta" && typeof row.payload?.cwd === "string") {
        return row.payload.cwd;
      }
    } catch {
      // Ignore partial/corrupt transcript lines.
    }
  }
  return null;
}

async function rolloutCwd(file: string): Promise<string | null> {
  return fs
    .readFile(file, "utf8")
    .then(sessionCwd)
    .catch(() => null);
}

interface TokenInfo {
  usedTokens: number;
  contextWindow: number | null;
  usage: UsageGauges;
}

/** Scan a rollout for the most recent token_count event and pull usage from it. */
async function latestTokenInfo(file: string): Promise<TokenInfo | null> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    let o: {
      type?: string;
      payload?: {
        type?: string;
        info?: RolloutInfo;
        rate_limits?: RolloutRateLimits;
      };
    };
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      o.type === "event_msg" &&
      o.payload?.type === "token_count" &&
      o.payload.info
    ) {
      const info = o.payload.info;
      const used =
        info.last_token_usage?.input_tokens ??
        info.total_token_usage?.input_tokens ??
        0;
      return {
        usedTokens: used,
        contextWindow: info.model_context_window ?? null,
        usage: mapRateLimits(o.payload.rate_limits),
      };
    }
  }
  return null;
}

interface RolloutInfo {
  last_token_usage?: { input_tokens?: number };
  total_token_usage?: { input_tokens?: number };
  model_context_window?: number;
}

interface RateWindow {
  used_percent?: number;
  window_minutes?: number;
  resets_at?: number;
}
interface RolloutRateLimits {
  primary?: RateWindow | null;
  secondary?: RateWindow | null;
}

/** Map Codex's primary/secondary windows to our 5-hour / 7-day gauges by width. */
function mapRateLimits(rl: RolloutRateLimits | undefined): UsageGauges {
  const out: UsageGauges = {
    fiveHour: null,
    sevenDay: null,
    fiveHourResetsAt: null,
    sevenDayResetsAt: null,
    updatedAt: Date.now(),
  };
  for (const w of [rl?.primary, rl?.secondary]) {
    if (!w || typeof w.used_percent !== "number") continue;
    const mins = w.window_minutes ?? 0;
    const resets = typeof w.resets_at === "number" ? w.resets_at * 1000 : null;
    if (mins <= 600) {
      out.fiveHour = clampPct(w.used_percent);
      out.fiveHourResetsAt = resets;
    } else {
      out.sevenDay = clampPct(w.used_percent);
      out.sevenDayResetsAt = resets;
    }
  }
  return out;
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v));
