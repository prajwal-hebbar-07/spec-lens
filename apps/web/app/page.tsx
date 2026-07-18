"use client";

import { ConnectionProvider } from "@/components/ConnectionProvider";
import { PlanWorkspace } from "@/components/PlanWorkspace";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UsageDashboard } from "@/components/UsageDashboard";
import { ScanText } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <ConnectionProvider>
        <nav className="surface sticky top-3 z-40 mb-5 flex flex-wrap items-center gap-3 p-2.5 shadow-md shadow-foreground/5">
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
              <ScanText className="size-4.5" />
            </div>
            <h1 className="font-semibold tracking-tight">Spec Lens</h1>
          </div>

          <UsageDashboard />
          <div className="ml-auto xl:ml-0">
            <ThemeToggle />
          </div>
        </nav>

        <PlanWorkspace />
      </ConnectionProvider>
    </main>
  );
}
