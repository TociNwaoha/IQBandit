"use client";

/**
 * app/integrations/IntegrationCardActions.tsx
 * Client component — renders connection action buttons on each provider card.
 *
 * - api_key_form providers: Connect expands an inline form; Disconnect clears the token.
 * - oauth_redirect providers: Connect shown as disabled stub (OAuth flow not yet built).
 * - webhook_inbound providers: Configure shown as placeholder.
 * - Disconnect always works for any connected provider.
 */

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import type { ConnectionMethod } from "@/lib/integrations/providerRegistry";

type Mode = "idle" | "form" | "saving" | "disconnecting";

interface Props {
  providerId: string;
  connectionMethod: ConnectionMethod;
  hasConnection: boolean;
  credentialLabel?: string;
  oauthStartUrl?: string;
}

export function IntegrationCardActions({
  providerId,
  connectionMethod,
  hasConnection,
  credentialLabel = "API Key",
  oauthStartUrl,
}: Props) {
  const [mode, setMode]           = useState<Mode>("idle");
  const [keyValue, setKeyValue]   = useState("");
  const [labelValue, setLabelValue] = useState("");
  const [err, setErr]             = useState<string | null>(null);

  // ── connect (api_key_form) ─────────────────────────────────────────────────

  async function handleSave() {
    if (!keyValue.trim()) return;
    setMode("saving");
    setErr(null);
    try {
      const res = await fetch("/api/integrations/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id:   providerId,
          auth_type:     "api_key",
          access_token:  keyValue.trim(),
          account_label: labelValue.trim() || providerId,
        }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = (await res.json().catch(() => ({ error: "Save failed" }))) as { error?: string };
        setErr(data.error ?? "Save failed");
        setMode("form");
      }
    } catch {
      setErr("Network error — could not reach the server");
      setMode("form");
    }
  }

  // ── disconnect ─────────────────────────────────────────────────────────────

  async function handleDisconnect() {
    setMode("disconnecting");
    setErr(null);
    try {
      const res = await fetch("/api/integrations/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = (await res.json().catch(() => ({ error: "Disconnect failed" }))) as { error?: string };
        setErr(data.error ?? "Disconnect failed");
        setMode("idle");
      }
    } catch {
      setErr("Network error");
      setMode("idle");
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  // api_key_form: inline form flow
  if (connectionMethod === "api_key_form" && !hasConnection) {
    if (mode === "idle") {
      return (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode("form")}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: "var(--color-text-primary)", color: "var(--color-bg-base)" }}
          >
            Connect
          </button>
          {err && <span className="text-xs text-red-500">{err}</span>}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2 w-full mt-1">
        <input
          type="text"
          placeholder="Label (e.g. My Account)"
          value={labelValue}
          onChange={(e) => setLabelValue(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all"
          style={{
            background: "var(--color-bg-base)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-primary)",
          }}
        />
        <input
          type="password"
          placeholder={credentialLabel}
          value={keyValue}
          onChange={(e) => setKeyValue(e.target.value)}
          autoComplete="new-password"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") { setMode("idle"); setErr(null); }
          }}
          className="w-full px-3 py-2 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all"
          style={{
            background: "var(--color-bg-base)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-primary)",
          }}
        />
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!keyValue.trim() || mode === "saving"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium transition-colors"
            style={{ background: "var(--color-text-primary)", color: "var(--color-bg-base)" }}
          >
            {mode === "saving" && <Loader2 size={12} className="animate-spin" />}
            {mode === "saving" ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => { setMode("idle"); setErr(null); }}
            className="px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{
              border: "1px solid var(--color-border)",
              color: "var(--color-text-muted)",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // oauth_redirect: active link when oauthStartUrl provided; disabled stub otherwise
  if (connectionMethod === "oauth_redirect" && !hasConnection) {
    return (
      <div className="flex items-center gap-2">
        {oauthStartUrl ? (
          <a
            href={oauthStartUrl}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: "var(--color-text-primary)", color: "var(--color-bg-base)" }}
          >
            Connect via OAuth
            <ExternalLink size={10} />
          </a>
        ) : (
          <button
            disabled
            title="OAuth connection flow coming soon"
            className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-not-allowed"
            style={{ background: "var(--color-bg-surface-2)", color: "var(--color-text-muted)" }}
          >
            Connect via OAuth
          </button>
        )}
        {err && <span className="text-xs text-red-500">{err}</span>}
      </div>
    );
  }

  // webhook_inbound: placeholder
  if (connectionMethod === "webhook_inbound" && !hasConnection) {
    return (
      <button
        disabled
        title="Webhook URL setup coming soon"
        className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-not-allowed"
        style={{ background: "var(--color-bg-surface-2)", color: "var(--color-text-muted)" }}
      >
        Configure Webhook
      </button>
    );
  }

  // Connected state — show disconnect
  if (hasConnection) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleDisconnect}
          disabled={mode === "disconnecting"}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-xs transition-colors"
          style={{ border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}
        >
          {mode === "disconnecting" && <Loader2 size={12} className="animate-spin" />}
          {mode === "disconnecting" ? "Disconnecting…" : "Disconnect"}
        </button>
        {err && <span className="text-xs text-red-500">{err}</span>}
      </div>
    );
  }

  // Fallback (manual / unknown method)
  return (
    <button
      disabled
      className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-not-allowed"
      style={{ background: "var(--color-bg-surface-2)", color: "var(--color-text-muted)" }}
    >
      Connect
    </button>
  );
}
