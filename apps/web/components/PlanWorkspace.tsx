"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquarePlus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlanViewer, type SelectionAnchor } from "@/components/PlanViewer";
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

export function PlanWorkspace() {
  const [plans, setPlans] = useState<PlanFile[]>([]);
  const [name, setName] = useState<string>(""); // disk-backed plan name, "" if uploaded
  const [content, setContent] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

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

  async function addComment() {
    if (!anchor || !draft.trim() || !name) return;
    setBusy(true);
    const data = await getJSON<{ content: string }>(
      `/api/plans/${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insertOffset: anchor.insertOffset, comment: draft.trim() }),
      },
    );
    setBusy(false);
    if (data) {
      setContent(data.content);
      setDraft("");
      setAnchor(null);
      window.getSelection()?.removeAllRanges();
    }
  }

  async function removeComment(offset: number, marker: string) {
    if (!content || !name) return;
    // Drop the marker and a single preceding space if we added one.
    const start = content[offset - 1] === " " ? offset - 1 : offset;
    const next = content.slice(0, start) + content.slice(offset + marker.length);
    setBusy(true);
    const data = await getJSON<{ content: string }>(
      `/api/plans/${encodeURIComponent(name)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: next }),
      },
    );
    setBusy(false);
    if (data) setContent(data.content);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            value={name}
            onChange={(e) => openPlan(e.target.value)}
          >
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
          <p className="text-muted-foreground">Pick a plan to view and review it.</p>
        ) : (
          <PlanViewer markdown={content} onSelect={annotatable ? setAnchor : undefined} />
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
              <li
                key={c.offset}
                className="rounded-lg border border-border bg-card p-2.5 text-sm"
              >
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

      {/* Floating add-comment popover anchored to the selection */}
      {anchor && annotatable && (
        <div
          className="fixed z-50 w-72 rounded-xl border border-border bg-popover p-3 shadow-lg"
          style={{
            top: Math.min(anchor.rect.bottom + 8, window.innerHeight - 200),
            left: Math.min(anchor.rect.left, window.innerWidth - 300),
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MessageSquarePlus className="size-3.5" /> Review comment
            </span>
            <button
              type="button"
              onClick={() => {
                setAnchor(null);
                setDraft("");
              }}
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addComment();
            }}
            placeholder="What should change here?"
            className="mb-2 h-20 w-full resize-none rounded-lg border border-border bg-background p-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={addComment} disabled={busy || !draft.trim()}>
              Add comment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
