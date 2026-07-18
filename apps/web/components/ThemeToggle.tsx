"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  window.dispatchEvent(new Event("themechange"));
}

export function ThemeToggle() {
  useEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystem = (event: MediaQueryListEvent) => {
      if (!localStorage.getItem("theme")) applyTheme(event.matches);
    };

    preference.addEventListener("change", followSystem);
    return () => preference.removeEventListener("change", followSystem);
  }, []);

  function toggleTheme() {
    const dark = !document.documentElement.classList.contains("dark");
    localStorage.setItem("theme", dark ? "dark" : "light");
    applyTheme(dark);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle color theme"
      title="Toggle color theme"
      className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card/80 text-muted-foreground transition hover:border-primary/30 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      <Moon className="size-4.5 dark:hidden" />
      <Sun className="hidden size-4.5 dark:block" />
    </button>
  );
}
