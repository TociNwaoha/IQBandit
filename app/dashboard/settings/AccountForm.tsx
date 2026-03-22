"use client";

import { useState } from "react";

interface Props {
  initialName:      string;
  email:            string;
  initialAgentName: string;
  initialUseCase:   string;
}

export function AccountForm({ initialName, email, initialAgentName, initialUseCase }: Props) {
  const [name,      setName]      = useState(initialName);
  const [agentName, setAgentName] = useState(initialAgentName);
  const [useCase,   setUseCase]   = useState(initialUseCase);
  const [loading,   setLoading]   = useState(false);
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, agentName, useCase }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { showToast(data.error ?? "Failed to save", false); return; }
      showToast("Changes saved", true);
    } catch {
      showToast("Network error", false);
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "input";
  const labelClass = "block text-xs mb-1.5 font-medium";

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} style={{ color: "var(--color-text-secondary)" }}>Display name</label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={100}
          />
        </div>
        <div>
          <label className={labelClass} style={{ color: "var(--color-text-secondary)" }}>Email</label>
          <input
            className={`${inputClass} opacity-50 cursor-not-allowed`}
            value={email}
            readOnly
            tabIndex={-1}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} style={{ color: "var(--color-text-secondary)" }}>Agent name</label>
        <input
          className={inputClass}
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder="My Agent"
          maxLength={100}
        />
        <p className="text-[11px] mt-1" style={{ color: "var(--color-text-muted)" }}>The name your AI agent introduces itself with.</p>
      </div>

      <div>
        <label className={labelClass} style={{ color: "var(--color-text-secondary)" }}>Use case</label>
        <input
          className={inputClass}
          value={useCase}
          onChange={(e) => setUseCase(e.target.value)}
          placeholder="e.g. Social media, Research, Email…"
          maxLength={100}
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
          {loading ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
