"use client";

import { ConnectionProvider } from "@/components/ConnectionProvider";
import { PlanWorkspace } from "@/components/PlanWorkspace";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UsageDashboard } from "@/components/UsageDashboard";
import { ScanText } from "lucide-react";

export default function Home() {
  return (
    <ConnectionProvider>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border/80 bg-background/95 shadow-sm backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-3 py-2.5 sm:px-6 lg:px-8">
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
      </header>

      <main className="mx-auto min-h-screen max-w-7xl px-3 pt-44 pb-3 sm:px-6 sm:pt-36 sm:pb-5 lg:px-8 lg:pt-32 xl:pt-24">
        <PlanWorkspace />
      </main>
    </ConnectionProvider>
  );
}
