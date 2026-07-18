/** Shared types for the account / chat / usage dashboard. */

export type Provider = "claude" | "codex";

export interface Account {
  provider: Provider;
  /** Stable identifier. For Claude this is the config dir; for Codex, "codex". */
  key: string;
  email: string | null;
  displayName: string | null;
  plan: string | null;
  /** Whether this is the currently-active login (best-effort). */
  active: boolean;
}

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string | null;
  cwd: string | null;
}

export interface ChatDetail extends ChatSummary {
  /** Context-window usage 0-100, or null if not derivable. */
  contextPct: number | null;
  usedTokens: number | null;
  contextWindow: number | null;
}

export interface UsageGauges {
  /** Account-level rolling limits, 0-100 each, or null if unknown. */
  fiveHour: number | null;
  sevenDay: number | null;
  fiveHourResetsAt: number | null;
  sevenDayResetsAt: number | null;
  updatedAt: number | null;
}
