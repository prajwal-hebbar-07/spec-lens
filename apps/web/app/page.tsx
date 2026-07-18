"use client";

import { PlanWorkspace } from "@/components/PlanWorkspace";
import { UsageDashboard } from "@/components/UsageDashboard";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold">spec-lens</h1>
      </header>

      <UsageDashboard />
      <PlanWorkspace />
    </main>
  );
}
