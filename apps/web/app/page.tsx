"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PlanViewer } from "@/components/PlanViewer";
import { UsageDashboard } from "@/components/UsageDashboard";

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setMarkdown(await file.text());
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">spec-lens</h1>
          {filename && <p className="text-sm text-muted-foreground">{filename}</p>}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".md,.markdown"
          className="hidden"
          onChange={onPick}
        />
        <Button onClick={() => inputRef.current?.click()}>Browse…</Button>
      </header>

      <UsageDashboard />

      {markdown === null ? (
        <p className="text-muted-foreground">Pick a plan Markdown file to view it.</p>
      ) : (
        <PlanViewer markdown={markdown} />
      )}
    </main>
  );
}
