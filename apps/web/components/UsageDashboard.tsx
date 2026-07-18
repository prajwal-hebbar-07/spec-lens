"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@/components/ConnectionProvider";
import { Select } from "@/components/ui/select";
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

  const stats = [
    {
      label: "Context",
      value: chat?.contextPct != null ? `${Math.round(chat.contextPct)}%` : "—",
      detail:
        chat?.usedTokens != null && chat?.contextWindow != null
          ? `${fmtTokens(chat.usedTokens)} / ${fmtTokens(chat.contextWindow)}`
          : "Select a chat",
      color: "bg-chart-1",
      danger: (chat?.contextPct ?? 0) >= 90,
    },
    {
      label: "5h",
      value: usage?.fiveHour != null ? `${Math.round(usage.fiveHour)}%` : "—",
      detail: resetLabel(usage?.fiveHourResetsAt ?? null),
      color: "bg-chart-4",
      danger: (usage?.fiveHour ?? 0) >= 90,
    },
    {
      label: "7d",
      value: usage?.sevenDay != null ? `${Math.round(usage.sevenDay)}%` : "—",
      detail: resetLabel(usage?.sevenDayResetsAt ?? null),
      color: "bg-chart-5",
      danger: (usage?.sevenDay ?? 0) >= 90,
    },
  ];

  return (
    <section className="order-3 flex basis-full flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center xl:order-none xl:min-w-0 xl:flex-1 xl:flex-nowrap">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 xl:flex-nowrap">
        <div className="inline-flex h-9 shrink-0 rounded-lg border border-input bg-background/60 p-0.5 shadow-xs">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={provider === p.value}
              onClick={() => setProvider(p.value)}
              className={cn(
                "rounded-md px-2.5 text-xs font-semibold transition",
                provider === p.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="min-w-48 flex-1">
          <Select
            label="Account"
            className="h-9 rounded-lg"
            value={accountKey}
            onValueChange={setAccountKey}
            disabled={providerAccounts.length === 0}
            placeholder="No accounts found"
            options={providerAccounts.map((account) => ({
              value: account.key,
              label: `${account.displayName ?? account.email ?? account.key}${account.displayName && account.email ? ` · ${account.email}` : ""}`,
            }))}
          />
        </div>

        <div className="min-w-64 flex-[1.5]">
          <Select
            label="Conversation"
            className="h-9 rounded-lg"
            value={chatId}
            onValueChange={setChatId}
            disabled={chats.length === 0}
            placeholder="No conversations found"
            options={chats.map((chat) => ({ value: chat.id, label: chat.title }))}
          />
        </div>
      </div>

      <div
        className="grid shrink-0 grid-cols-3 gap-1.5"
        title={usage?.updatedAt ? `Usage updated ${untilAgo(usage.updatedAt)}` : "Usage status"}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            title={stat.detail}
            aria-label={`${stat.label}: ${stat.value}. ${stat.detail}`}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border/70 bg-muted/35 px-2.5 text-xs"
          >
            <span
              className={cn("size-1.5 shrink-0 rounded-full", stat.danger ? "bg-destructive" : stat.color)}
            />
            <span className="text-muted-foreground">{stat.label}</span>
            <strong className={cn("font-semibold tabular-nums", stat.danger && "text-destructive")}>
              {stat.value}
            </strong>
          </div>
        ))}
      </div>
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
