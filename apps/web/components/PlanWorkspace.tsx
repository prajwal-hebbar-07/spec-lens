"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageSquarePlus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlanViewer, type SelectionAnchor } from "@/components/PlanViewer";
import { useConnection } from "@/components/ConnectionProvider";
import { parsePlanComments } from "@/lib/plan-comments";
import type { PlanFile } from "@/lib/plans";

async function getJSON<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface QA {
  id: number;
  question: string;
  selection?: string;
  answer?: string;
  error?: string;
  pending: boolean;
}

export function PlanWorkspace() {
  const { provider, accountKey, chatId, chatTitle } = useConnection();

  const [plans, setPlans] = useState<PlanFile[]>([]);
  const [name, setName] = useState<string>(""); // disk-backed plan name, "" if uploaded
  const [content, setContent] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<QA[]>([]);
  const [generalQ, setGeneralQ] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const qaId = useRef(0);

  const comments = useMemo(() => (content ? parsePlanComments(content) : []), [content]);
  const annotatable = name !== "" && content !== null;

  useEffect(() => {
    getJSON<PlanFile[]>("/api/plans").then((p) => setPlans(p ?? []));
  }, []);

  async function openPlan(planName: string) {
    setAnchor(null);
    setName(planName);
    if (!planName) {
      setContent(null);
      return;
    }
    const data = await getJSON<{ content: string }>(`/api/plans/${encodeURIComponent(planName)}`);
    setContent(data?.content ?? null);
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setName("");
    setAnchor(null);
    setContent(await file.text());
  }

  // --- review comments -----------------------------------------------------

  async function addComment() {
    if (!anchor || !draft.trim() || !name) return;
    setBusy(true);
    const data = await getJSON<{ content: string }>(`/api/plans/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insertOffset: anchor.insertOffset, comment: draft.trim() }),
    });
    setBusy(false);
    if (data) {
      setContent(data.content);
      resetPopover();
    }
  }

  async function removeComment(offset: number, marker: string) {
    if (!content || !name) return;
    const start = content[offset - 1] === " " ? offset - 1 : offset;
    const next = content.slice(0, start) + content.slice(offset + marker.length);
    setBusy(true);
    const data = await getJSON<{ content: string }>(`/api/plans/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: next }),
    });
    setBusy(false);
    if (data) setContent(data.content);
  }

  function resetPopover() {
    setDraft("");
    setAnchor(null);
    window.getSelection()?.removeAllRanges();
  }

  // --- ask the plan's chat -------------------------------------------------

  async function ask(question: string, selection?: string) {
    const q = question.trim();
    if (!q) return;
    const id = ++qaId.current;
    if (!chatId) {
      setThread((t) => [
        ...t,
        { id, question: q, selection, pending: false, error: "Select a chat in the dashboard first." },
      ]);
      return;
    }
    setThread((t) => [...t, { id, question: q, selection, pending: true }]);
    const res = await getJSON<{ answer?: string; error?: string }>("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, account: accountKey, chatId, question: q, selection }),
    });
    setThread((t) =>
      t.map((item) =>
        item.id === id
          ? {
              ...item,
              pending: false,
              answer: res?.answer,
              error: res?.answer ? undefined : (res?.error ?? "The request failed."),
            }
          : item,
      ),
    );
  }

  function askFromSelection() {
    if (!anchor || !draft.trim()) return;
    ask(draft, anchor.quote);
    resetPopover();
  }

  const selectCls =
    "h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select className={selectCls} value={name} onChange={(e) => openPlan(e.target.value)}>
            <option value="">{plans.length ? "Select a plan…" : "No plans found"}</option>
            {plans.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            ref={uploadRef}
            type="file"
            accept=".md,.markdown"
            className="hidden"
            onChange={onUpload}
          />
          <Button variant="outline" size="sm" onClick={() => uploadRef.current?.click()}>
            Upload…
          </Button>
          {content !== null && !annotatable && (
            <span className="text-xs text-muted-foreground">
              Uploaded file — open a plan from the list to add review comments
            </span>
          )}
        </div>

        {content === null ? (
          <p className="text-muted-foreground">Pick a plan to view, review, and ask about it.</p>
        ) : (
          <PlanViewer markdown={content} onSelect={setAnchor} />
        )}

        {/* Q&A panel */}
        {content !== null && (
          <section className="mt-8 border-t border-border pt-5">
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="size-4" /> Ask the plan&apos;s chat
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              {chatId
                ? `Answered by ${provider === "codex" ? "Codex" : "Claude"} · ${chatTitle ?? "selected chat"}`
                : "Select an account and chat in the dashboard above, then ask."}
            </p>

            <div className="flex flex-col gap-3">
              {thread.map((qa) => (
                <div key={qa.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-1 text-sm font-medium">{qa.question}</div>
                  {qa.selection && (
                    <blockquote className="mb-2 border-l-2 border-border pl-2 text-xs text-muted-foreground">
                      {qa.selection.length > 160 ? qa.selection.slice(0, 160) + "…" : qa.selection}
                    </blockquote>
                  )}
                  {qa.pending && <div className="text-sm text-muted-foreground">Thinking…</div>}
                  {qa.error && <div className="text-sm text-destructive">{qa.error}</div>}
                  {qa.answer && (
                    <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{qa.answer}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                ask(generalQ);
                setGeneralQ("");
              }}
            >
              <input
                className={`${selectCls} flex-1`}
                value={generalQ}
                onChange={(e) => setGeneralQ(e.target.value)}
                placeholder="Ask a question about this plan…"
              />
              <Button type="submit" size="sm" disabled={!generalQ.trim()}>
                Ask
              </Button>
            </form>
          </section>
        )}
      </div>

      {/* Review comments sidebar */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <h2 className="mb-2 text-sm font-semibold">
          Review comments{comments.length > 0 && ` (${comments.length})`}
        </h2>
        {!annotatable ? (
          <p className="text-xs text-muted-foreground">
            Open a plan from the list, then select text to leave an <code>@me</code> comment for{" "}
            <code>/plan-review</code>.
          </p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No comments yet. Select any text in the plan to add one.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {comments.map((c) => (
              <li key={c.offset} className="rounded-lg border border-border bg-card p-2.5 text-sm">
                {c.anchor && (
                  <div className="mb-1 truncate text-xs text-muted-foreground">…{c.anchor}</div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <span>{c.text}</span>
                  <button
                    type="button"
                    onClick={() => removeComment(c.offset, c.marker)}
                    disabled={busy}
                    aria-label="Remove comment"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Floating popover anchored to the selection: comment or ask */}
      {anchor && (
        <div
          className="fixed z-50 w-72 rounded-xl border border-border bg-popover p-3 shadow-lg"
          style={{
            top: Math.min(anchor.rect.bottom + 8, window.innerHeight - 220),
            left: Math.min(anchor.rect.left, window.innerWidth - 300),
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Selected text</span>
            <button
              type="button"
              onClick={resetPopover}
              aria-label="Cancel"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <blockquote className="mb-2 max-h-16 overflow-hidden border-l-2 border-border pl-2 text-xs text-muted-foreground">
            {anchor.quote.length > 120 ? anchor.quote.slice(0, 120) + "…" : anchor.quote}
          </blockquote>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a review comment, or ask the chat about this…"
            className="mb-2 h-20 w-full resize-none rounded-lg border border-border bg-background p-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="flex justify-end gap-2">
            {annotatable && (
              <Button variant="outline" size="sm" onClick={addComment} disabled={busy || !draft.trim()}>
                <MessageSquarePlus className="size-3.5" /> Comment
              </Button>
            )}
            <Button size="sm" onClick={askFromSelection} disabled={!draft.trim()}>
              <Sparkles className="size-3.5" /> Ask
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
