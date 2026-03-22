"use client";

import { useState } from "react";

export function PasswordForm() {
  const [current,  setCurrent]  = useState("");
  const [next,     setNext]     = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showCur,  setShowCur]  = useState(false);
  const [showNew,  setShowNew]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { showToast("New passwords don't match", false); return; }
    if (next.length < 8)  { showToast("New password must be at least 8 characters", false); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/users/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { showToast(data.error ?? "Failed to update", false); return; }
      showToast("Password updated", true);
      setCurrent(""); setNext(""); setConfirm("");
    } catch {
      showToast("Network error", false);
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "input";
  const labelClass = "block text-xs mb-1.5 font-medium";

  function PasswordField({
    label, value, onChange, show, onToggle, placeholder,
  }: {
    label: string; value: string; onChange: (v: string) => void;
    show: boolean; onToggle: () => void; placeholder?: string;
  }) {
    return (
      <div>
        <label className={labelClass} style={{ color: "var(--color-text-secondary)" }}>{label}</label>
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            className={`${inputClass} pr-10`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoComplete="new-password"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={onToggle}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs transition-colors"
            style={{ color: "var(--color-text-muted)" }}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
      <PasswordField
        label="Current password"
        value={current}
        onChange={setCurrent}
        show={showCur}
        onToggle={() => setShowCur((v) => !v)}
        placeholder="••••••••"
      />
      <PasswordField
        label="New password"
        value={next}
        onChange={setNext}
        show={showNew}
        onToggle={() => setShowNew((v) => !v)}
        placeholder="Min. 8 characters"
      />
      <div>
        <label className={labelClass} style={{ color: "var(--color-text-secondary)" }}>Confirm new password</label>
        <input
          type={showNew ? "text" : "password"}
          className={inputClass}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat new password"
          autoComplete="new-password"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        {toast ? (
          <span className={`text-xs ${toast.ok ? "text-emerald-400" : "text-red-400"}`}>
            {toast.msg}
          </span>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
      </div>
    </form>
  );
}
