"use client";

import { useEffect } from "react";

type Variant = "success" | "error" | "info";

interface ToastProps {
  message: string;
  variant?: Variant;
  duration?: number;
  onDismiss: () => void;
}

const variantStyles: Record<Variant, string> = {
  success: "bg-emerald-900/80 border-emerald-700/60 text-emerald-200",
  error:   "bg-red-900/80 border-red-700/60 text-red-200",
  info:    "",
};

const variantIcon: Record<Variant, string> = {
  success: "✓",
  error:   "✕",
  info:    "ℹ",
};

export function Toast({ message, variant = "info", duration = 3000, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [duration, onDismiss]);

  const infoStyle = variant === "info"
    ? { background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }
    : {};

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm transition-all ${variantStyles[variant]}`}
      style={infoStyle}
    >
      <span className="font-bold">{variantIcon[variant]}</span>
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100 text-base leading-none">×</button>
    </div>
  );
}
