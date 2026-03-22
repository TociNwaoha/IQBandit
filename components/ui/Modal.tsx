"use client";

import { useEffect, ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-xl"
        style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}
      >
        {(title != null) && (
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: "1px solid var(--color-border)" }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{title}</p>
            <button
              onClick={onClose}
              className="transition-colors text-lg leading-none"
              style={{ color: "var(--color-text-muted)" }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        )}
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
