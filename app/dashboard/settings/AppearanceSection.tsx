"use client";

import { useTheme } from "@/components/ThemeProvider";
import { Moon, Sun } from "lucide-react";

export function AppearanceSection() {
  const { theme, toggleTheme, mounted } = useTheme();

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
          Theme
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          {!mounted ? "Loading…" : theme === "dark" ? "Dark mode" : "Light mode"}
        </p>
      </div>
      <button
        onClick={toggleTheme}
        disabled={!mounted}
        className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
        style={{
          background: "var(--color-bg-surface-2)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-secondary)",
        }}
        aria-label="Toggle theme"
      >
        {mounted && theme === "dark" ? (
          <><Sun size={15} /> Light mode</>
        ) : (
          <><Moon size={15} /> Dark mode</>
        )}
      </button>
    </div>
  );
}
