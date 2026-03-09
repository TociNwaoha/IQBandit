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
import type { ConnectionMethod } from "@/lib/integrations/providerRegistry";

// ─── styles ───────────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "5px 8px",
  fontFamily: "monospace",
  fontSize: "12px",
  border: "1px solid #e8e8e4",
  borderRadius: "5px",
  background: "#fff",
  color: "#1a1a17",
  outline: "none",
  boxSizing: "border-box",
};

const BTN = (primary: boolean, danger = false): React.CSSProperties => ({
  padding: "4px 10px",
  fontFamily: "monospace",
  fontSize: "11px",
  fontWeight: 600,
  borderRadius: "5px",
  cursor: danger ? "pointer" : primary ? "pointer" : "pointer",
  border: primary ? "none" : danger ? "1px solid #fca5a5" : "1px solid #e8e8e4",
  background: primary ? "#1a1a17" : danger ? "#fef2f2" : "#fff",
  color: primary ? "#fff" : danger ? "#991b1b" : "#6b6b60",
  opacity: 1,
});

const BTN_DISABLED: React.CSSProperties = {
  ...BTN(false),
  opacity: 0.45,
  cursor: "not-allowed",
};

// ─── component ────────────────────────────────────────────────────────────────

type Mode = "idle" | "form" | "saving" | "disconnecting";

interface Props {
  providerId: string;
  connectionMethod: ConnectionMethod;
  hasConnection: boolean;
  credentialLabel?: string;
  /**
   * When provided for an oauth_redirect provider, renders an active "Connect via OAuth"
   * link instead of the disabled placeholder stub.  Should be the absolute-path start
   * URL, e.g. "/api/integrations/oauth/notion/start".
   */
  oauthStartUrl?: string;
}

export function IntegrationCardActions({
  providerId,
  connectionMethod,
  hasConnection,
  credentialLabel = "API Key",
  oauthStartUrl,
}: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [keyValue, setKeyValue] = useState("");
  const [labelValue, setLabelValue] = useState("");
  const [err, setErr] = useState<string | null>(null);

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
          provider_id: providerId,
          auth_type: "api_key",
          access_token: keyValue.trim(),
          account_label: labelValue.trim() || providerId,
        }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = (await res.json().catch(() => ({ error: "Save failed" }))) as {
          error?: string;
        };
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
        const data = (await res.json().catch(() => ({ error: "Disconnect failed" }))) as {
          error?: string;
        };
        setErr(data.error ?? "Disconnect failed");
        setMode("idle");
      }
    } catch {
      setErr("Network error");
      setMode("idle");
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  // Always-present disconnect button when connected
  const disconnectBtn = hasConnection && (
    <button
      onClick={handleDisconnect}
      disabled={mode === "disconnecting"}
      style={mode === "disconnecting" ? BTN_DISABLED : BTN(false, true)}
    >
      {mode === "disconnecting" ? "…" : "Disconnect"}
    </button>
  );

  // api_key_form: inline form flow
  if (connectionMethod === "api_key_form" && !hasConnection) {
    if (mode === "idle") {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button onClick={() => setMode("form")} style={BTN(true)}>
            Connect
          </button>
          {err && <span style={{ fontSize: "11px", color: "#991b1b" }}>{err}</span>}
        </div>
      );
    }

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "5px",
          width: "100%",
        }}
      >
        <input
          type="text"
          placeholder="Label (e.g. My Account)"
          value={labelValue}
          onChange={(e) => setLabelValue(e.target.value)}
          style={INPUT}
        />
        <input
          type="password"
          placeholder={credentialLabel}
          value={keyValue}
          onChange={(e) => setKeyValue(e.target.value)}
          style={INPUT}
          autoComplete="new-password"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") {
              setMode("idle");
              setErr(null);
            }
          }}
        />
        {err && (
          <span style={{ fontSize: "11px", color: "#991b1b" }}>{err}</span>
        )}
        <div style={{ display: "flex", gap: "5px" }}>
          <button
            onClick={handleSave}
            disabled={!keyValue.trim() || mode === "saving"}
            style={!keyValue.trim() || mode === "saving" ? BTN_DISABLED : BTN(true)}
          >
            {mode === "saving" ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => {
              setMode("idle");
              setErr(null);
            }}
            style={BTN(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // oauth_redirect: active link when oauthStartUrl is wired up; disabled stub otherwise
  if (connectionMethod === "oauth_redirect" && !hasConnection) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {oauthStartUrl ? (
          <a
            href={oauthStartUrl}
            style={{ ...BTN(true), textDecoration: "none", display: "inline-block" }}
          >
            Connect via OAuth
          </a>
        ) : (
          <button
            disabled
            title="OAuth connection flow coming soon"
            style={BTN_DISABLED}
          >
            Connect via OAuth
          </button>
        )}
        {err && <span style={{ fontSize: "11px", color: "#991b1b" }}>{err}</span>}
      </div>
    );
  }

  // webhook_inbound: placeholder
  if (connectionMethod === "webhook_inbound" && !hasConnection) {
    return (
      <button disabled title="Webhook URL setup coming soon" style={BTN_DISABLED}>
        Configure Webhook
      </button>
    );
  }

  // Connected state — just show disconnect (all methods)
  if (hasConnection) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {disconnectBtn}
        {err && <span style={{ fontSize: "11px", color: "#991b1b" }}>{err}</span>}
      </div>
    );
  }

  // Fallback (manual / unknown method)
  return (
    <button disabled style={BTN_DISABLED}>
      Connect
    </button>
  );
}
