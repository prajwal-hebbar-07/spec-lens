"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Account, ChatSummary, Provider } from "@/lib/dashboard";

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface Connection {
  provider: Provider;
  setProvider: (p: Provider) => void;
  accounts: Account[];
  providerAccounts: Account[];
  accountKey: string;
  setAccountKey: (k: string) => void;
  chats: ChatSummary[];
  chatId: string;
  setChatId: (id: string) => void;
  /** Title of the selected chat, for display. */
  chatTitle: string | null;
}

const ConnectionContext = createContext<Connection | null>(null);

/** Shared account/chat selection used by both the usage dashboard and plan ask. */
export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<Provider>("claude");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountKey, setAccountKey] = useState<string>("");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatId, setChatId] = useState<string>("");

  const providerAccounts = useMemo(
    () => accounts.filter((a) => a.provider === provider),
    [accounts, provider],
  );

  useEffect(() => {
    getJSON<Account[]>("/api/accounts").then((a) => setAccounts(a ?? []));
  }, []);

  // Pick a sensible default account when the provider or account list changes.
  useEffect(() => {
    const first = providerAccounts[0];
    if (!first) {
      setAccountKey("");
      return;
    }
    if (!providerAccounts.some((a) => a.key === accountKey)) {
      setAccountKey((providerAccounts.find((a) => a.active) ?? first).key);
    }
  }, [providerAccounts, accountKey]);

  // Load chats for the selected account.
  useEffect(() => {
    if (!accountKey) {
      setChats([]);
      return;
    }
    getJSON<ChatSummary[]>(
      `/api/chats?provider=${provider}&account=${encodeURIComponent(accountKey)}`,
    ).then((c) => setChats(c ?? []));
  }, [provider, accountKey]);

  // Default-select the most recent chat.
  useEffect(() => {
    const first = chats[0];
    if (!first) {
      setChatId("");
      return;
    }
    if (!chats.some((c) => c.id === chatId)) setChatId(first.id);
  }, [chats, chatId]);

  const chatTitle = useMemo(
    () => chats.find((c) => c.id === chatId)?.title ?? null,
    [chats, chatId],
  );

  const value: Connection = {
    provider,
    setProvider,
    accounts,
    providerAccounts,
    accountKey,
    setAccountKey,
    chats,
    chatId,
    setChatId,
    chatTitle,
  };

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): Connection {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used within a ConnectionProvider");
  return ctx;
}
