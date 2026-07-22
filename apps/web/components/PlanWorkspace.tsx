"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileText,
  MessageSquare,
  MessageSquarePlus,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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
  const [name, setName] = useState<string>("");
  const [content, setContent] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [thread, setThread] = useState<QA[]>([]);
  const [generalQ, setGeneralQ] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const qaId = useRef(0);

  const comments = useMemo(
    () => (content ? parsePlanComments(content) : []),
    [content],
  );
  const annotatable = name !== "" && content !== null;
  const planQuery = useMemo(
    () =>
      new URLSearchParams({ provider, account: accountKey, chatId }).toString(),
    [provider, accountKey, chatId],
  );

  useEffect(() => {
    setName("");
    setContent(null);
    setPlans([]);
    setAnchor(null);
    setReviewStatus(null);
    if (!chatId) {
      return;
    }
    let current = true;
    getJSON<PlanFile[]>(`/api/plans?${planQuery}`).then((p) => {
      if (current) setPlans(p ?? []);
    });
    return () => {
      current = false;
    };
  }, [chatId, planQuery]);

  async function openPlan(planName: string) {
    setAnchor(null);
    setReviewStatus(null);
    setName(planName);
    if (!planName) {
      setContent(null);
      return;
    }
    const data = await getJSON<{ content: string }>(
      `/api/plans/${encodeURIComponent(planName)}?${planQuery}`,
    );
    setContent(data?.content ?? null);
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!chatId) {
      setReviewStatus({
        text: "Select the plan's chat before importing a file.",
        error: true,
      });
      return;
    }
    setBusy(true);
    setAnchor(null);
    try {
      const fileContent = await file.text();
      const response = await fetch(`/api/plans?${planQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, content: fileContent }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setReviewStatus({
          text: data.error ?? "Could not import the plan.",
          error: true,
        });
        return;
      }
      setName(file.name);
      setContent(fileContent);
      setReviewStatus({
        text: `Imported ${file.name} into this chat's workspace.`,
      });
      setPlans((await getJSON<PlanFile[]>(`/api/plans?${planQuery}`)) ?? []);
    } catch {
      setReviewStatus({ text: "Could not import the plan.", error: true });
    } finally {
      setBusy(false);
    }
  }

  // --- review comments -----------------------------------------------------

  async function addComment() {
    if (!anchor || !draft.trim() || !name) return;
    setBusy(true);
    const data = await getJSON<{ content: string }>(
      `/api/plans/${encodeURIComponent(name)}?${planQuery}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insertOffset: anchor.insertOffset,
          comment: draft.trim(),
        }),
      },
    );
    setBusy(false);
    if (data) {
      setContent(data.content);
      resetPopover();
    }
  }

  async function removeComment(offset: number, marker: string) {
    if (!content || !name) return;
    const start = content[offset - 1] === " " ? offset - 1 : offset;
    const next =
      content.slice(0, start) + content.slice(offset + marker.length);
    setBusy(true);
    const data = await getJSON<{ content: string }>(
      `/api/plans/${encodeURIComponent(name)}?${planQuery}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: next }),
      },
    );
    setBusy(false);
    if (data) setContent(data.content);
  }

  async function runReview() {
    if (!name || comments.length === 0) return;
    if (!chatId) {
      setReviewStatus({
        text: "Select the chat that produced this plan first.",
        error: true,
      });
      return;
    }
    setReviewing(true);
    setReviewStatus(null);
    try {
      const response = await fetch(
        `/api/plans/${encodeURIComponent(name)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, account: accountKey, chatId }),
        },
      );
      const result = (await response.json()) as {
        content?: string;
        remainingComments?: number;
        error?: string;
      };
      if (typeof result.content === "string") setContent(result.content);
      if (!response.ok) {
        setReviewStatus({
          text: result.error ?? "The review failed.",
          error: true,
        });
      } else if (result.remainingComments) {
        setReviewStatus({
          text: `Review finished with ${result.remainingComments} comment(s) remaining.`,
        });
      } else {
        setReviewStatus({
          text: `Review complete with ${provider === "claude" ? "Claude" : "Codex"}. All comments were resolved.`,
        });
      }
    } catch {
      setReviewStatus({ text: "Could not start the review.", error: true });
    } finally {
      setReviewing(false);
    }
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
        {
          id,
          question: q,
          selection,
          pending: false,
          error: "Select a chat in the dashboard first.",
        },
      ]);
      return;
    }
    setThread((t) => [...t, { id, question: q, selection, pending: true }]);
    const res = await getJSON<{ answer?: string; error?: string }>("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        account: accountKey,
        chatId,
        question: q,
        selection,
      }),
    });
    setThread((t) =>
      t.map((item) =>
        item.id === id
          ? {
              ...item,
              pending: false,
              answer: res?.answer,
              error: res?.answer
                ? undefined
                : (res?.error ?? "The request failed."),
            }
          : item,
      ),
    );
  }

  function askFromSelection() {
    if (!anchor || !draft.trim()) return;
    ask(draft, anchor.quote);
    resetPopover();
    setAskOpen(true);
  }

  function startNewChat() {
    setThread([]);
    setGeneralQ("");
  }

  return (
    <Dialog.Root open={askOpen} onOpenChange={setAskOpen}>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <section className="surface overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
              <div>
                <div className="eyebrow mb-1.5 flex items-center gap-1.5">
                  <FileText className="size-3.5 text-primary" /> Plan reader
                </div>
                <h2 className="text-base font-semibold tracking-tight">
                  {name ||
                    (content !== null
                      ? "Uploaded document"
                      : "Choose a document")}
                </h2>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select
                  label="Select a plan"
                  className="min-w-0 sm:w-64"
                  value={name}
                  onValueChange={openPlan}
                  disabled={plans.length === 0}
                  placeholder={
                    plans.length ? "Select a plan…" : "No plans found"
                  }
                  options={plans.map((plan) => ({
                    value: plan.name,
                    label: plan.name,
                  }))}
                />
                <input
                  ref={uploadRef}
                  type="file"
                  accept=".md,.markdown"
                  className="hidden"
                  onChange={onUpload}
                />
                <Button
                  variant="outline"
                  onClick={() => uploadRef.current?.click()}
                  disabled={busy || !chatId}
                >
                  <Upload /> Upload
                </Button>
                {content !== null && (
                  <Dialog.Trigger
                    className={buttonVariants({ variant: "outline" })}
                  >
                    <Sparkles /> Ask chat
                  </Dialog.Trigger>
                )}
              </div>
            </div>

            {content === null ? (
              <div className="flex min-h-80 flex-col items-center justify-center px-6 py-14 text-center">
                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                  <FileText className="size-6" />
                </div>
                <h3 className="font-semibold">Bring a plan into focus</h3>
                <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">
                  Open a plan from your workspace or upload a Markdown file to
                  read, review, and discuss it.
                </p>
              </div>
            ) : (
              <div className="p-5 sm:p-8 lg:p-10">
                <PlanViewer markdown={content} onSelect={setAnchor} />
              </div>
            )}
          </section>
        </div>

        {/* Review comments sidebar */}
        <aside className="surface p-4 lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-y-auto xl:top-24 xl:max-h-[calc(100vh-7rem)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Review comments</h2>
            </div>
            <div className="flex items-center gap-2">
              {comments.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {comments.length}
                </span>
              )}
              {annotatable && comments.length > 0 && (
                <Button
                  size="sm"
                  onClick={runReview}
                  disabled={reviewing || !chatId}
                >
                  <Sparkles />{" "}
                  {reviewing
                    ? "Reviewing…"
                    : `Run with ${provider === "claude" ? "Claude" : "Codex"}`}
                </Button>
              )}
            </div>
          </div>
          {reviewStatus && (
            <div
              role="status"
              className={`mb-4 rounded-lg px-3 py-2 text-xs ${reviewStatus.error ? "bg-destructive/10 text-destructive" : "bg-accent/40 text-accent-foreground"}`}
            >
              {reviewStatus.text}
            </div>
          )}
          {!annotatable ? (
            <div className="rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
              Select a chat, then open or upload a plan to leave an{" "}
              <code>@me</code> note for <code>/plan-review</code>.
            </div>
          ) : comments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs leading-5 text-muted-foreground">
              Select any text in the plan to add your first comment.
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {comments.map((c) => (
                <li
                  key={c.offset}
                  className="rounded-xl border border-border/70 bg-muted/25 p-3 text-sm"
                >
                  {c.anchor && (
                    <div className="mb-1.5 truncate text-xs text-muted-foreground">
                      …{c.anchor}
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <span className="leading-5">{c.text}</span>
                    <button
                      type="button"
                      onClick={() => removeComment(c.offset, c.marker)}
                      disabled={busy}
                      aria-label="Remove comment"
                      className="shrink-0 rounded-lg p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
            className="fixed z-50 w-[min(20rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-popover p-4 shadow-2xl shadow-foreground/10"
            style={{
              top: Math.min(anchor.rect.bottom + 8, window.innerHeight - 220),
              left: Math.min(anchor.rect.left, window.innerWidth - 300),
              maxHeight: Math.max(
                204,
                window.innerHeight - anchor.rect.bottom - 24,
              ),
            }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">Selected text</span>
              <button
                type="button"
                onClick={resetPopover}
                aria-label="Cancel"
                className="rounded-lg p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <blockquote className="mb-3 max-h-16 overflow-hidden rounded-r-lg border-l-2 border-chart-2 bg-accent/20 py-2 pr-2 pl-3 text-xs text-muted-foreground">
              {anchor.quote.length > 120
                ? anchor.quote.slice(0, 120) + "…"
                : anchor.quote}
            </blockquote>
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a review comment, or ask the chat about this…"
              className="mb-3 h-24 w-full resize-none rounded-xl border border-input bg-background/70 p-3 text-sm shadow-inner outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
            />
            <div className="flex justify-end gap-2">
              {annotatable && (
                <Button
                  variant="outline"
                  onClick={addComment}
                  disabled={busy || !draft.trim()}
                >
                  <MessageSquarePlus className="size-3.5" /> Comment
                </Button>
              )}
              <Button onClick={askFromSelection} disabled={!draft.trim()}>
                <Sparkles className="size-3.5" /> Ask
              </Button>
            </div>
          </div>
        )}

        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/20 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <Dialog.Popup className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md translate-x-0 flex-col border-l border-border bg-background shadow-2xl transition-transform duration-200 ease-out data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full">
            <header className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </div>
                <div>
                  <Dialog.Title className="text-sm font-semibold">
                    Ask the plan&apos;s chat
                  </Dialog.Title>
                  <Dialog.Description className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {chatId
                      ? `Answered by ${provider === "codex" ? "Codex" : "Claude"} · ${chatTitle ?? "selected chat"}`
                      : "Select an account and conversation above, then ask."}
                  </Dialog.Description>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startNewChat}
                  disabled={thread.length === 0 && !generalQ}
                >
                  <Plus /> New chat
                </Button>
                <Dialog.Close
                  aria-label="Close ask panel"
                  className={buttonVariants({ variant: "ghost", size: "icon" })}
                >
                  <X />
                </Dialog.Close>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-5">
              {thread.length === 0 && (
                <div className="m-auto max-w-xs text-center text-sm leading-6 text-muted-foreground">
                  Ask a question about the plan or select text in the document
                  and ask about that passage.
                </div>
              )}
              {thread.map((qa) => (
                <div
                  key={qa.id}
                  className="rounded-xl border border-border/70 bg-muted/25 p-4"
                >
                  <div className="mb-1 text-sm font-medium">{qa.question}</div>
                  {qa.selection && (
                    <blockquote className="mb-3 mt-2 rounded-r-lg border-l-2 border-chart-2 bg-accent/20 py-2 pr-2 pl-3 text-xs text-muted-foreground">
                      {qa.selection.length > 160
                        ? qa.selection.slice(0, 160) + "…"
                        : qa.selection}
                    </blockquote>
                  )}
                  {qa.pending && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="size-1.5 animate-pulse rounded-full bg-primary" />{" "}
                      Thinking…
                    </div>
                  )}
                  {qa.error && (
                    <div className="text-sm text-destructive">{qa.error}</div>
                  )}
                  {qa.answer && (
                    <div className="plan-prose prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {qa.answer}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form
              className="flex gap-2 border-t border-border bg-background p-4 sm:p-5"
              onSubmit={(e) => {
                e.preventDefault();
                ask(generalQ);
                setGeneralQ("");
              }}
            >
              <input
                className="field min-w-0 flex-1"
                value={generalQ}
                onChange={(e) => setGeneralQ(e.target.value)}
                placeholder="Ask about this plan…"
              />
              <Button type="submit" disabled={!generalQ.trim()}>
                <Sparkles /> Ask
              </Button>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </div>
    </Dialog.Root>
  );
}
