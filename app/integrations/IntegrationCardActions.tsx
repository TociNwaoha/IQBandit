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
            className="px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-xs font-medium text-white transition-colors"
          >
            Connect
          </button>
          {err && <span className="text-xs text-red-600">{err}</span>}
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
          className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 transition-all"
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
          className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs text-gray-900 font-mono placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 transition-all"
        />
        {err && <p className="text-xs text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!keyValue.trim() || mode === "saving"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-white transition-colors"
          >
            {mode === "saving" && <Loader2 size={12} className="animate-spin" />}
            {mode === "saving" ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => { setMode("idle"); setErr(null); }}
            className="px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 text-xs text-gray-500 hover:text-gray-700 transition-colors"
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-xs font-medium text-white transition-colors"
          >
            Connect via OAuth
            <ExternalLink size={10} />
          </a>
        ) : (
          <button
            disabled
            title="OAuth connection flow coming soon"
            className="px-3 py-1.5 rounded-lg bg-gray-100 text-xs font-medium text-gray-400 cursor-not-allowed"
          >
            Connect via OAuth
          </button>
        )}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    );
  }

  // webhook_inbound: placeholder
  if (connectionMethod === "webhook_inbound" && !hasConnection) {
    return (
      <button
        disabled
        title="Webhook URL setup coming soon"
        className="px-3 py-1.5 rounded-lg bg-gray-100 text-xs font-medium text-gray-400 cursor-not-allowed"
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs text-red-600 hover:text-red-700 transition-colors"
        >
          {mode === "disconnecting" && <Loader2 size={12} className="animate-spin" />}
          {mode === "disconnecting" ? "Disconnecting…" : "Disconnect"}
        </button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    );
  }

  // Fallback (manual / unknown method)
  return (
    <button
      disabled
      className="px-3 py-1.5 rounded-lg bg-gray-100 text-xs font-medium text-gray-400 cursor-not-allowed"
    >
      Connect
    </button>
  );
}
