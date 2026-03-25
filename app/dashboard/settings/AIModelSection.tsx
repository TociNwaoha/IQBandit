"use client";

/**
 * app/dashboard/settings/AIModelSection.tsx
 * Lets users switch between BanditLM and BYOK after onboarding.
 * Calls POST /api/users/model to persist the choice.
 */

import { useEffect, useState } from "react";
import { BYOK_PROVIDERS } from "@/lib/plans";

interface UsageInfo {
  model_mode:    string;
  credits_display: string;
  empty:         boolean;
  byok_provider: string | null;
  byok_model_id: string | null;
}

export function AIModelSection() {
  const [info,        setInfo]        = useState<UsageInfo | null>(null);
  const [modelMode,   setModelMode]   = useState<"banditlm" | "byok">("banditlm");
  const [byokProvider, setByokProvider] = useState("openai");
  const [byokApiKey,  setByokApiKey]  = useState("");
  const [byokModelId, setByokModelId] = useState("");
  const [byokBaseUrl, setByokBaseUrl] = useState("");
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d: UsageInfo) => {
        setInfo(d);
        setModelMode(d.model_mode === "byok" ? "byok" : "banditlm");
        if (d.byok_provider) setByokProvider(d.byok_provider);
        if (d.byok_model_id) setByokModelId(d.byok_model_id);
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const res = await fetch("/api/users/model", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          modelMode === "banditlm"
            ? { mode: "banditlm" }
            : {
                mode:     "byok",
                provider: byokProvider,
                api_key:  byokApiKey || undefined,
                model_id: byokModelId,
                base_url: byokBaseUrl,
              }
        ),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setSaveError(data.error ?? "Failed to save");
      } else {
        setSaved(true);
        // Re-fetch to reflect the new state
        fetch("/api/usage").then((r) => r.json()).then(setInfo).catch(() => {});
      }
    } catch {
      setSaveError("Network error");
    } finally {
      setSaving(false);
    }
  }

  const canSave = modelMode === "banditlm"
    || (!!byokModelId.trim() && (!!byokApiKey.trim() || info?.model_mode === "byok"));

  return (
    <div className="flex flex-col gap-4">
      {/* Current status line */}
      {info && (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          {info.model_mode === "byok"
            ? `Using ${info.byok_provider ?? "custom"} key${info.byok_model_id ? ` · ${info.byok_model_id}` : ""}`
            : info.empty
              ? "BanditLM credits used up"
              : `BanditLM · ${info.credits_display} remaining`
          }
        </p>
      )}

      {/* BanditLM card */}
      <button
        onClick={() => setModelMode("banditlm")}
        className={`text-left px-4 py-4 rounded-xl border transition-all ${
          modelMode === "banditlm"
            ? "border-blue-500 bg-blue-500/10"
            : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 hover:border-zinc-300 dark:hover:border-zinc-700"
        }`}
        style={{ borderColor: modelMode === "banditlm" ? undefined : "var(--color-border)" }}
      >
        <p className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
          ⚡ BanditLM
          <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full">Built-in</span>
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
          IQBandit&apos;s built-in AI — $5 free credits, no key needed
        </p>
      </button>

      {/* BYOK card */}
      <button
        onClick={() => setModelMode("byok")}
        className="text-left px-4 py-4 rounded-xl border transition-all"
        style={{
          borderColor: modelMode === "byok" ? "#3b82f6" : "var(--color-border)",
          background:  modelMode === "byok" ? "rgba(59,130,246,0.08)" : "var(--color-bg-surface-2)",
        }}
      >
        <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>🔑 Bring Your Own Key</p>
        <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
          OpenAI, Anthropic, DeepSeek, or any OpenAI-compatible endpoint
        </p>
      </button>

      {/* BYOK sub-form */}
      {modelMode === "byok" && (
        <div className="flex flex-col gap-3 pl-1">
          <select
            value={byokProvider}
            onChange={(e) => setByokProvider(e.target.value)}
            className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors"
            style={{
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          >
            {BYOK_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <input
            type="password"
            value={byokApiKey}
            onChange={(e) => setByokApiKey(e.target.value)}
            placeholder={
              info?.model_mode === "byok"
                ? "Enter new key to replace (leave blank to keep existing)"
                : (BYOK_PROVIDERS.find((p) => p.id === byokProvider)?.placeholder ?? "API key")
            }
            className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors"
            style={{
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          />

          <input
            type="text"
            value={byokModelId}
            onChange={(e) => setByokModelId(e.target.value)}
            placeholder="Model ID — e.g. gpt-4o, claude-sonnet-4-6, deepseek-chat"
            className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors"
            style={{
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          />

          {byokProvider === "custom" && (
            <input
              type="text"
              value={byokBaseUrl}
              onChange={(e) => setByokBaseUrl(e.target.value)}
              placeholder="Base URL — e.g. https://your-endpoint.com/v1"
              className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors"
              style={{
                background: "var(--color-bg-surface)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            />
          )}
        </div>
      )}

      {/* Save row */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => void handleSave()}
          disabled={saving || !canSave}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: "var(--color-text-primary)",
            color: "var(--color-bg-base)",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved    && <span className="text-xs text-green-500">Saved ✓</span>}
        {saveError && <span className="text-xs text-red-400">{saveError}</span>}
      </div>
    </div>
  );
}
