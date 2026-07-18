import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Account, ChatDetail, ChatSummary, UsageGauges } from "@/lib/dashboard";
import { readClaudeCredentials } from "@/lib/keychain";

// Claude models expose a 200k context window; the 1M-context variants encode
// "1m" in the model id. Used to turn a token count into a context percentage.
const DEFAULT_CONTEXT_WINDOW = 200_000;
const LARGE_CONTEXT_WINDOW = 1_000_000;

/** A Claude login is a CLAUDE_CONFIG_DIR directory with its own .claude.json. */
interface ClaudeConfig {
  key: string; // absolute config dir path
  configFile: string;
  projectsDir: string;
}

/**
 * Enumerate Claude config directories. The user's `cc1`/`cc2` aliases point
 * CLAUDE_CONFIG_DIR at `~/.claude-two` / `~/.claude-one`, so each `~/.claude-*`
 * directory that carries a `.claude.json` is one account.
 */
async function configDirs(): Promise<ClaudeConfig[]> {
  const home = os.homedir();
  const entries = await fs.readdir(home, { withFileTypes: true }).catch(() => []);
  const dirs = entries
    .filter((e) => e.isDirectory() && /^\.claude-/.test(e.name))
    .map((e) => path.join(home, e.name));

  const configs: ClaudeConfig[] = [];
  for (const dir of dirs) {
    const configFile = path.join(dir, ".claude.json");
    if (await exists(configFile)) {
      configs.push({ key: dir, configFile, projectsDir: path.join(dir, "projects") });
    }
  }
  return configs;
}

/**
 * Group config dirs by login email. A single login (e.g. the Cursor integration
 * and a terminal alias) can span several `~/.claude-*` dirs; we present it as one
 * account keyed by email and union its chats.
 */
async function accountsByEmail(): Promise<
  Map<string, { dirs: ClaudeConfig[]; oauth: OAuthAccount }>
> {
  const configs = await configDirs();
  const byEmail = new Map<string, { dirs: ClaudeConfig[]; oauth: OAuthAccount }>();
  for (const cfg of configs) {
    const oauth = await readOAuthAccount(cfg.configFile);
    if (!oauth?.emailAddress) continue; // only real, logged-in accounts
    const entry = byEmail.get(oauth.emailAddress);
    if (entry) entry.dirs.push(cfg);
    else byEmail.set(oauth.emailAddress, { dirs: [cfg], oauth });
  }
  return byEmail;
}

export async function listAccounts(): Promise<Account[]> {
  const active = process.env.CLAUDE_CONFIG_DIR
    ? path.resolve(process.env.CLAUDE_CONFIG_DIR)
    : null;

  const byEmail = await accountsByEmail();
  const accounts: Account[] = [];
  for (const [email, { dirs, oauth }] of byEmail) {
    accounts.push({
      provider: "claude",
      key: email,
      email,
      displayName: oauth.displayName ?? null,
      plan: oauth.organizationType ?? null,
      active: active !== null && dirs.some((d) => path.resolve(d.key) === active),
    });
  }
  accounts.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
  return accounts;
}

/** Config dirs belonging to a login email (the account `key`). */
async function dirsForEmail(email: string): Promise<string[]> {
  const entry = (await accountsByEmail()).get(email);
  return entry ? entry.dirs.map((d) => d.projectsDir) : [];
}

/** Resolve the login email that owns a given config dir (for usage ingest). */
export async function emailForConfigDir(configDir: string): Promise<string | null> {
  const oauth = await readOAuthAccount(path.join(configDir, ".claude.json"));
  return oauth?.emailAddress ?? null;
}

/**
 * Locate a session for a headless `claude --resume`: the config dir
 * (CLAUDE_CONFIG_DIR) that owns it and the project cwd it was created in
 * (--resume only finds sessions from their original working directory).
 */
export async function sessionLocation(
  email: string,
  sessionId: string,
): Promise<{ configDir: string; cwd: string | null } | null> {
  const entry = (await accountsByEmail()).get(email);
  if (!entry) return null;
  for (const cfg of entry.dirs) {
    const files = await transcriptFiles(cfg.projectsDir);
    const match = files.find((f) => path.basename(f, ".jsonl") === sessionId);
    if (match) {
      const summarized = await summarize(match);
      return { configDir: cfg.key, cwd: summarized?.summary.cwd ?? null };
    }
  }
  return null;
}

const EMPTY_USAGE: UsageGauges = {
  fiveHour: null,
  sevenDay: null,
  fiveHourResetsAt: null,
  sevenDayResetsAt: null,
  updatedAt: null,
};

// The usage endpoint is strictly rate-limited, so cache each account's result on
// disk, only refresh when stale, and honor a cooldown after a 429 so repeated
// dashboard loads never hammer the endpoint (which would extend the lockout).
const USAGE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;
const USAGE_CACHE_FILE = path.join(os.homedir(), ".spec-lens", "usage-cache.json");

interface OAuthUsageResponse {
  five_hour?: { used_percentage?: number; resets_at?: number };
  seven_day?: { used_percentage?: number; resets_at?: number };
}

interface UsageCacheEntry {
  gauges: UsageGauges;
  /** Epoch ms before which we must not call the API again (429 backoff). */
  cooldownUntil?: number;
}

async function readUsageCache(): Promise<Record<string, UsageCacheEntry>> {
  try {
    return JSON.parse(await fs.readFile(USAGE_CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeUsageCache(cache: Record<string, UsageCacheEntry>): Promise<void> {
  await fs.mkdir(path.dirname(USAGE_CACHE_FILE), { recursive: true });
  await fs.writeFile(USAGE_CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Fetch an account's live rolling-limit usage from Anthropic's OAuth usage
 * endpoint — the same source Claude Code and the Cursor panel read. Matches a
 * Keychain credential to the account by organizationUuid, caches the result
 * (the endpoint is rate-limited), and falls back to the cache on failure.
 */
export async function getUsageForAccount(email: string): Promise<UsageGauges> {
  const cache = await readUsageCache();
  const cached = cache[email];
  const lastGauges = cached?.gauges ?? EMPTY_USAGE;

  // Serve cache while fresh, or while cooling down after a 429.
  if (cached?.gauges.updatedAt && Date.now() - cached.gauges.updatedAt < USAGE_TTL_MS) {
    return lastGauges;
  }
  if (cached?.cooldownUntil && Date.now() < cached.cooldownUntil) {
    return lastGauges;
  }

  const entry = (await accountsByEmail()).get(email);
  const orgUuid = entry?.oauth.organizationUuid ?? null;
  const creds = await readClaudeCredentials();
  const cred = (orgUuid && creds.find((c) => c.organizationUuid === orgUuid)) || creds[0];
  if (!cred) return lastGauges;
  // Skip the call if the token is already expired — it would only 401. The CLI
  // refreshes the Keychain token when the account is next used.
  if (cred.expiresAt && Date.now() > cred.expiresAt) return lastGauges;

  try {
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${cred.accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
      },
    });
    if (!res.ok) {
      // Back off (respect Retry-After) so we don't keep tripping the limit.
      const retryAfter = Number(res.headers.get("retry-after"));
      const cooldown = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : DEFAULT_COOLDOWN_MS;
      cache[email] = { gauges: lastGauges, cooldownUntil: Date.now() + cooldown };
      await writeUsageCache(cache);
      return lastGauges;
    }
    const data = (await res.json()) as OAuthUsageResponse;
    const gauges: UsageGauges = {
      fiveHour: pctOrNull(data.five_hour?.used_percentage),
      sevenDay: pctOrNull(data.seven_day?.used_percentage),
      fiveHourResetsAt: toMs(data.five_hour?.resets_at),
      sevenDayResetsAt: toMs(data.seven_day?.resets_at),
      updatedAt: Date.now(),
    };
    cache[email] = { gauges };
    await writeUsageCache(cache);
    return gauges;
  } catch {
    return lastGauges;
  }
}

function pctOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
}

/** Epoch seconds or ms → ms. */
function toMs(epoch: unknown): number | null {
  if (typeof epoch !== "number" || !Number.isFinite(epoch)) return null;
  return epoch < 1e12 ? epoch * 1000 : epoch;
}

export async function listChats(email: string, limit = 60): Promise<ChatSummary[]> {
  const projectDirs = await dirsForEmail(email);
  const fileGroups = await Promise.all(projectDirs.map((d) => transcriptFiles(d)));
  const files = fileGroups.flat();
  const summaries = await Promise.all(files.map((f) => summarize(f)));
  return summaries
    .filter((s): s is { summary: ChatSummary; mtime: number } => s !== null)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map((s) => s.summary);
}

export async function getChatDetail(email: string, id: string): Promise<ChatDetail | null> {
  const projectDirs = await dirsForEmail(email);
  const fileGroups = await Promise.all(projectDirs.map((d) => transcriptFiles(d)));
  const files = fileGroups.flat();
  const match = files.find((f) => path.basename(f, ".jsonl") === id);
  if (!match) return null;

  const result = await summarize(match);
  if (!result) return null;

  const { usedTokens, model } = await latestUsage(match);
  const contextWindow =
    model && /1m/i.test(model) ? LARGE_CONTEXT_WINDOW : DEFAULT_CONTEXT_WINDOW;
  const contextPct =
    usedTokens != null ? Math.min(100, (usedTokens / contextWindow) * 100) : null;

  return {
    ...result.summary,
    contextPct,
    usedTokens,
    contextWindow: usedTokens != null ? contextWindow : null,
  };
}

// ---- internals ----------------------------------------------------------

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(() => true).catch(() => false);
}

interface OAuthAccount {
  emailAddress?: string;
  displayName?: string;
  organizationType?: string;
  organizationUuid?: string;
}

async function readOAuthAccount(configFile: string): Promise<OAuthAccount | null> {
  try {
    const raw = await fs.readFile(configFile, "utf8");
    const parsed = JSON.parse(raw) as { oauthAccount?: OAuthAccount };
    return parsed.oauthAccount ?? null;
  } catch {
    return null;
  }
}

/** All `<projects>/<encoded-cwd>/<uuid>.jsonl` transcript files (top level only). */
async function transcriptFiles(projectsDir: string): Promise<string[]> {
  const projects = await fs.readdir(projectsDir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    const dir = path.join(projectsDir, p.name);
    const files = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const f of files) {
      if (f.isFile() && f.name.endsWith(".jsonl")) out.push(path.join(dir, f.name));
    }
  }
  return out;
}

async function summarize(
  file: string,
): Promise<{ summary: ChatSummary; mtime: number } | null> {
  try {
    const stat = await fs.stat(file);
    const raw = await fs.readFile(file, "utf8");
    const lines = raw.split("\n");
    let title = "";
    let cwd: string | null = null;
    for (const line of lines) {
      if (!line.trim()) continue;
      let o: Record<string, unknown>;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      if (cwd == null && typeof o.cwd === "string") cwd = o.cwd;
      if (!title && o.type === "user") {
        title = firstUserText(o);
      }
      if (title && cwd) break;
    }
    return {
      summary: {
        id: path.basename(file, ".jsonl"),
        title: title || "(untitled chat)",
        updatedAt: new Date(stat.mtimeMs).toISOString(),
        cwd,
      },
      mtime: stat.mtimeMs,
    };
  } catch {
    return null;
  }
}

/** Extract a plain-text preview from a user message line. */
function firstUserText(o: Record<string, unknown>): string {
  const message = o.message as { content?: unknown } | undefined;
  const content = message?.content;
  let text = "";
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    const block = content.find(
      (b): b is { type: string; text: string } =>
        typeof b === "object" && b !== null && (b as { type?: string }).type === "text",
    );
    text = block?.text ?? "";
  }
  text = text.replace(/\s+/g, " ").trim();
  // Skip command/meta noise so the title reads like the user's first ask.
  if (!text || text.startsWith("<") || text.startsWith("Caveat:")) return "";
  return text.length > 80 ? text.slice(0, 80) + "…" : text;
}

/**
 * Tokens filling the context window on the latest assistant turn = input +
 * cache-read + cache-creation (mirrors the statusline's total_input_tokens).
 */
async function latestUsage(
  file: string,
): Promise<{ usedTokens: number | null; model: string | null }> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const lines = raw.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line || !line.trim()) continue;
      let o: { type?: string; message?: { model?: string; usage?: Record<string, number> } };
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      const usage = o.type === "assistant" ? o.message?.usage : undefined;
      if (usage) {
        const used =
          (usage.input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0);
        return { usedTokens: used, model: o.message?.model ?? null };
      }
    }
  } catch {
    // fall through
  }
  return { usedTokens: null, model: null };
}
