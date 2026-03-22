"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const { theme, toggleTheme, mounted } = useTheme();

  // Render placeholder until theme is known to avoid flicker
  if (!mounted) {
    return (
      <div className={`w-9 h-9 rounded-lg ${className}`} />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${className}`}
      style={{
        background: "var(--color-bg-surface-2)",
        border: "1px solid var(--color-border)",
        color: "var(--color-text-muted)",
      }}
    >
      {theme === "dark" ? (
        <Sun size={15} />
      ) : (
        <Moon size={15} />
      )}
    </button>
  );
}
