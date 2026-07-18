"use client";

import { useEffect, useState } from "react";
import { RingGauge } from "@/components/RingGauge";
import { useConnection } from "@/components/ConnectionProvider";
import { cn } from "@/lib/utils";
import type { ChatDetail, Provider, UsageGauges } from "@/lib/dashboard";

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
];

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** "1d 5h" / "2h 15m" / "45m" / "now" until the given epoch (ms). */
function untilReset(epoch: number | null): string | null {
  if (!epoch) return null;
  const diff = epoch - Date.now();
  if (diff <= 0) return "now";
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function UsageDashboard() {
  const {
    provider,
    setProvider,
    providerAccounts,
    accountKey,
    setAccountKey,
    chats,
    chatId,
    setChatId,
  } = useConnection();

  const [chat, setChat] = useState<ChatDetail | null>(null);
  const [usage, setUsage] = useState<UsageGauges | null>(null);

  // Load account-level usage gauges when the account changes.
  useEffect(() => {
    if (!accountKey) {
      setUsage(null);
      return;
    }
    getJSON<UsageGauges>(
      `/api/usage?provider=${provider}&account=${encodeURIComponent(accountKey)}`,
    ).then(setUsage);
  }, [provider, accountKey]);

  // Load chat detail (context %) when the selected chat changes.
  useEffect(() => {
    if (!chatId) {
      setChat(null);
      return;
    }
    getJSON<ChatDetail>(
      `/api/chats/${encodeURIComponent(chatId)}?provider=${provider}&account=${encodeURIComponent(accountKey)}`,
    ).then(setChat);
  }, [chatId, provider, accountKey]);

  const selectCls =
    "h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

  return (
    <section className="mb-8 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        {/* Provider toggle */}
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setProvider(p.value)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                provider === p.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Account select */}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Account</span>
          <select
            className={selectCls}
            value={accountKey}
            onChange={(e) => setAccountKey(e.target.value)}
            disabled={providerAccounts.length === 0}
          >
            {providerAccounts.length === 0 && <option value="">No accounts found</option>}
            {providerAccounts.map((a) => (
              <option key={a.key} value={a.key}>
                {a.email ?? a.key}
                {a.plan ? ` · ${a.plan}` : ""}
                {a.active ? " · active" : ""}
              </option>
            ))}
          </select>
        </label>

        {/* Chat select */}
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted-foreground">Chat</span>
          <select
            className={cn(selectCls, "max-w-[22rem] truncate")}
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            disabled={chats.length === 0}
          >
            {chats.length === 0 && <option value="">No chats</option>}
            {chats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Gauges */}
      <div className="mt-5 flex flex-wrap justify-center gap-8 sm:justify-start">
        <RingGauge
          pct={chat?.contextPct ?? null}
          label="Context"
          sublabel={
            chat?.usedTokens != null && chat?.contextWindow != null
              ? `${fmtTokens(chat.usedTokens)} / ${fmtTokens(chat.contextWindow)}`
              : "select a chat"
          }
          color="var(--chart-1)"
        />
        <RingGauge
          pct={usage?.fiveHour ?? null}
          label="5-hour limit"
          sublabel={resetLabel(usage?.fiveHourResetsAt ?? null)}
          color="var(--chart-4)"
        />
        <RingGauge
          pct={usage?.sevenDay ?? null}
          label="7-day limit"
          sublabel={resetLabel(usage?.sevenDayResetsAt ?? null)}
          color="var(--chart-5)"
        />
      </div>

      {usage?.updatedAt && (
        <p className="mt-3 text-xs text-muted-foreground">
          Limits updated {untilAgo(usage.updatedAt)} · live from{" "}
          {provider === "codex" ? "session transcript" : "the usage API"}
        </p>
      )}
    </section>
  );
}

function resetLabel(epoch: number | null): string {
  const s = untilReset(epoch);
  return s ? `resets in ${s}` : "no data yet";
}

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function untilAgo(epoch: number): string {
  const diff = Date.now() - epoch;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
