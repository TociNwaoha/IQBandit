"use client";

/**
 * app/officebuilding/ToolSuggestionCard.tsx
 * Suggestion card rendered below the last assistant message in the chat.
 *
 * Shows a suggested tool action (provider + action + prefilled inputs),
 * lets the user fill in any missing required fields, then executes via
 * /api/integrations/execute when "Run tool" is clicked.
 *
 * The user MUST click "Run tool" — nothing runs automatically.
 */

import { useState, useEffect } from "react";
import type { ToolSuggestion } from "./toolSuggester";

// ─── Palette (matches OfficeBuildingClient) ───────────────────────────────────

const P = {
  bg:          "#F7F7F4",
  card:        "#FFFFFF",
  border:      "#E8E8E4",
  fg:          "#1A1A17",
  sub:         "#6B6B60",
  placeholder: "#A8A89C",
  muted:       "#F0F0EC",
} as const;

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  suggestion:      ToolSuggestion;
  onDismiss:       () => void;
  /** Appends formatted result text to the chat composer textarea. */
  onInsert:        (text: string) => void;
  /** Active conversation ID — used as trust anchor for server-side enforcement. */
  conversationId?: string;
  /** Active agent ID — fallback when no conversation_id. */
  agentId?:        string;
}

// ─── Inline result formatter ──────────────────────────────────────────────────

function formatForInsert(
  providerId: string,
  action:     string,
  result:     unknown,
): string {
  const header = `[Tool result · ${providerId} / ${action}]`;
  if (!result || typeof result !== "object") return `${header}\n${String(result)}`;

  const obj = result as Record<string, unknown>;

  // Find primary data array
  const arrayKey = ["results", "accounts", "campaigns", "insights"].find(
    (k) => Array.isArray(obj[k]),
  );
  if (!arrayKey) {
    // Flat object (e.g. workspace info)
    const lines = [header];
    for (const [k, v] of Object.entries(obj)) {
      if (v !== null && v !== undefined && v !== "") lines.push(`${k}: ${String(v)}`);
    }
    return lines.join("\n");
  }

  const items   = obj[arrayKey] as unknown[];
  const hasMore = obj.has_more === true;
  const lines   = [
    header,
    `${items.length} ${arrayKey}${hasMore ? " (more available)" : ""}:\n`,
  ];
  for (const item of items.slice(0, 10)) {
    if (!item || typeof item !== "object") { lines.push(`• ${String(item)}`); continue; }
    const row  = item as Record<string, unknown>;
    const name = row.name ?? row.title ?? row.campaign_name ?? null;
    const id   = row.id ?? row.campaign_id ?? null;
    const parts: string[] = [];
    if (name) parts.push(String(name));
    if (id && String(id) !== String(name)) parts.push(`(${String(id)})`);
    for (const f of ["status", "currency", "spend", "impressions", "clicks", "ctr"]) {
      if (row[f] !== undefined && row[f] !== null && row[f] !== "")
        parts.push(`${f}: ${String(row[f])}`);
    }
    lines.push(`• ${parts.join(" · ")}`);
  }
  if (hasMore) lines.push(`\n(Increase limit to retrieve more records)`);
  return lines.join("\n");
}

// ─── Result summary (condensed view) ─────────────────────────────────────────

function ResultSummary({ result }: { result: unknown }) {
  if (!result || typeof result !== "object") {
    return (
      <p style={{ fontSize: 11, color: P.sub, marginTop: 6 }}>
        {String(result)}
      </p>
    );
  }
  const obj = result as Record<string, unknown>;
  const arrayKey = ["results", "accounts", "campaigns", "insights"].find(
    (k) => Array.isArray(obj[k]),
  );
  if (!arrayKey) {
    return (
      <pre
        style={{
          fontSize:   10,
          color:      P.fg,
          background: P.bg,
          border:     `1px solid ${P.border}`,
          borderRadius: 5,
          padding:    "6px 8px",
          marginTop:  6,
          whiteSpace: "pre-wrap",
          wordBreak:  "break-word",
          maxHeight:  120,
          overflowY:  "auto",
        }}
      >
        {JSON.stringify(obj, null, 2)}
      </pre>
    );
  }
  const items   = obj[arrayKey] as unknown[];
  const hasMore = obj.has_more === true;
  return (
    <div style={{ marginTop: 6 }}>
      <p style={{ fontSize: 10, color: P.sub, marginBottom: 4 }}>
        {items.length} {arrayKey}{hasMore ? " (more available)" : ""}
      </p>
      {items.slice(0, 3).map((item, i) => {
        if (!item || typeof item !== "object") return (
          <p key={i} style={{ fontSize: 10, color: P.fg }}>{String(item)}</p>
        );
        const row  = item as Record<string, unknown>;
        const name = row.name ?? row.title ?? row.campaign_name ?? row.id ?? "–";
        return (
          <div
            key={i}
            style={{
              fontSize:     10,
              color:        P.fg,
              padding:      "3px 6px",
              borderRadius: 4,
              background:   P.bg,
              border:       `1px solid ${P.border}`,
              marginBottom: 2,
            }}
          >
            {String(name)}
          </div>
        );
      })}
      {items.length > 3 && (
        <p style={{ fontSize: 10, color: P.placeholder }}>
          +{items.length - 3} more
        </p>
      )}
    </div>
  );
}

// ─── ToolSuggestionCard ───────────────────────────────────────────────────────

const AUTH_ERROR_CODES = new Set([
  "PROVIDER_TOKEN_EXPIRED",
  "PROVIDER_PERMISSION_ERROR",
]);

const PROVIDER_LABELS: Record<string, string> = {
  notion:   "Notion",
  meta_ads: "Meta Ads",
};

const ACTION_LABELS: Record<string, string> = {
  search_pages:  "Search Pages",
  get_insights:  "Get Insights",
  list_accounts: "List Accounts",
  list_campaigns: "List Campaigns",
  get_workspace_info: "Workspace Info",
};

export function ToolSuggestionCard({ suggestion, onDismiss, onInsert, conversationId = "", agentId = "" }: Props) {
  const [extraInput, setExtraInput]     = useState<Record<string, string>>({});
  const [running, setRunning]           = useState(false);
  const [runResult, setRunResult]       = useState<unknown>(null);
  const [runError, setRunError]         = useState<string | null>(null);
  const [runErrorCode, setRunErrorCode] = useState<string | null>(null);
  const [inserted, setInserted]         = useState(false);

  // ─── Ad account picker ──────────────────────────────────────────────────────
  // Only active when Meta Ads get_insights is suggested and ad_account_id is missing.
  // Auto-fetches list_accounts so the user can pick from a dropdown instead of typing.

  const needsAccountPicker = (
    suggestion.provider_id === "meta_ads" &&
    suggestion.action === "get_insights" &&
    suggestion.missingRequired.some((f) => f.key === "ad_account_id")
  );

  const [adAccounts, setAdAccounts]               = useState<{ id: string; name?: string }[]>([]);
  const [adAccountsLoading, setAdAccountsLoading] = useState(false);
  const [adAccountsError, setAdAccountsError]     = useState<string | null>(null);

  useEffect(() => {
    if (!needsAccountPicker) return;
    setAdAccountsLoading(true);
    fetch("/api/integrations/execute", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        provider_id: "meta_ads",
        action:      "list_accounts",
        input:       {},
        ...(conversationId ? { conversation_id: conversationId } : { agent_id: agentId }),
      }),
    })
      .then((r) => r.json())
      .then((d: { result?: unknown; error?: string }) => {
        if (d.error) { setAdAccountsError(d.error); return; }
        const obj = (d.result ?? {}) as Record<string, unknown>;
        // Meta list_accounts returns accounts under "accounts" or "data"
        const raw = Array.isArray(obj.accounts) ? obj.accounts
                  : Array.isArray(obj.data)     ? obj.data
                  : [];
        setAdAccounts(
          (raw as Record<string, unknown>[])
            .map((a) => ({
              id:   String(a.id   ?? ""),
              name: a.name ? String(a.name) : undefined,
            }))
            .filter((a) => a.id),
        );
      })
      .catch(() => setAdAccountsError("Could not load ad accounts."))
      .finally(() => setAdAccountsLoading(false));
  }, []); // runs once on mount; needsAccountPicker is stable for this card's lifetime

  const providerLabel = PROVIDER_LABELS[suggestion.provider_id] ?? suggestion.provider_id;
  const actionLabel   = ACTION_LABELS[suggestion.action]   ?? suggestion.action;

  async function run() {
    // Merge prefilled input with user-supplied extras
    const mergedInput: Record<string, string | number> = { ...suggestion.input };
    for (const f of suggestion.missingRequired) {
      const v = extraInput[f.key]?.trim();
      if (!v) {
        setRunError("Fill in all required fields before running.");
        return;
      }
      mergedInput[f.key] = v;
    }

    setRunning(true);
    setRunResult(null);
    setRunError(null);
    setRunErrorCode(null);

    try {
      const res  = await fetch("/api/integrations/execute", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          provider_id: suggestion.provider_id,
          action:      suggestion.action,
          input:       mergedInput,
          ...(conversationId ? { conversation_id: conversationId } : { agent_id: agentId }),
        }),
      });
      const data = await res.json() as { result?: unknown; error?: string; code?: string };
      if (!res.ok) {
        setRunError(data.error ?? `Request failed (${res.status})`);
        setRunErrorCode(data.code ?? null);
      } else {
        setRunResult(data.result ?? null);
      }
    } catch {
      setRunError("Network error — could not reach the server.");
    } finally {
      setRunning(false);
    }
  }

  function handleInsert() {
    onInsert(formatForInsert(suggestion.provider_id, suggestion.action, runResult));
    setInserted(true);
    setTimeout(() => setInserted(false), 2000);
  }

  return (
    <div
      style={{
        maxWidth:     "36rem",
        borderRadius: 10,
        border:       `1px solid ${P.border}`,
        background:   P.card,
        overflow:     "hidden",
        marginTop:    2,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        "8px 12px",
          background:     P.bg,
          borderBottom:   `1px solid ${P.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Lightbulb icon */}
          <svg
            style={{ width: 13, height: 13, color: P.sub, flexShrink: 0 }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span style={{ fontSize: 11, fontWeight: 600, color: P.sub }}>
            Tool suggestion
          </span>
          <span
            style={{
              fontSize:     10,
              color:        P.sub,
              background:   P.muted,
              border:       `1px solid ${P.border}`,
              borderRadius: 4,
              padding:      "1px 5px",
            }}
          >
            {providerLabel} · {actionLabel}
          </span>
        </div>
        <button
          onClick={onDismiss}
          style={{
            fontSize:   11,
            color:      P.placeholder,
            background: "none",
            border:     "none",
            cursor:     "pointer",
            padding:    "2px 4px",
          }}
          title="Dismiss suggestion"
        >
          ✕
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 12px" }}>
        {/* Reason */}
        <p style={{ fontSize: 10, color: P.placeholder, marginBottom: 8, lineHeight: 1.4 }}>
          {suggestion.reason}
        </p>

        {/* Prefilled input preview (non-empty fields from the rule) */}
        {Object.keys(suggestion.input).length > 0 && (
          <div
            style={{
              display:      "flex",
              flexWrap:     "wrap",
              gap:          4,
              marginBottom: 8,
            }}
          >
            {Object.entries(suggestion.input).map(([k, v]) => (
              <span
                key={k}
                style={{
                  fontSize:     10,
                  color:        P.sub,
                  background:   P.bg,
                  border:       `1px solid ${P.border}`,
                  borderRadius: 4,
                  padding:      "2px 6px",
                  fontFamily:   "monospace",
                }}
              >
                {k}: {String(v)}
              </span>
            ))}
          </div>
        )}

        {/* Missing required fields — user must fill these in */}
        {suggestion.missingRequired.map((f) => {
          // For Meta Ads ad_account_id: render a dropdown when accounts are available.
          const isAcctPicker = needsAccountPicker && f.key === "ad_account_id";

          const sharedInputStyle = {
            width:        "100%",
            fontSize:     11,
            padding:      "4px 7px",
            borderRadius: 5,
            border:       `1px solid ${P.border}`,
            background:   P.bg,
            color:        P.fg,
            outline:      "none",
            boxSizing:    "border-box" as const,
          };

          return (
            <div key={f.key} style={{ marginBottom: 8 }}>
              <label
                style={{
                  display:      "block",
                  fontSize:     10,
                  fontWeight:   600,
                  color:        P.sub,
                  marginBottom: 3,
                }}
              >
                {f.label}
                <span style={{ color: "#dc2626", marginLeft: 2 }}>*</span>
              </label>

              {isAcctPicker ? (
                adAccountsLoading ? (
                  <p style={{ fontSize: 10, color: P.placeholder, padding: "4px 0" }}>
                    Loading ad accounts…
                  </p>
                ) : adAccounts.length > 0 ? (
                  /* Dropdown — user picks from their connected ad accounts */
                  <select
                    value={extraInput[f.key] ?? ""}
                    onChange={(e) =>
                      setExtraInput((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                    style={{ ...sharedInputStyle, cursor: "pointer" }}
                  >
                    <option value="">Select an ad account…</option>
                    {adAccounts.map((acct) => (
                      <option key={acct.id} value={acct.id}>
                        {acct.name ? `${acct.name} (${acct.id})` : acct.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  /* Fetch failed or no accounts returned — fall back to text input */
                  <input
                    type="text"
                    value={extraInput[f.key] ?? ""}
                    onChange={(e) =>
                      setExtraInput((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                    placeholder={adAccountsError ? f.placeholder ?? "" : "No accounts found — enter manually"}
                    style={sharedInputStyle}
                  />
                )
              ) : (
                /* Normal text input for all other required fields */
                <input
                  type="text"
                  value={extraInput[f.key] ?? ""}
                  onChange={(e) =>
                    setExtraInput((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  placeholder={f.placeholder ?? ""}
                  style={sharedInputStyle}
                />
              )}
            </div>
          );
        })}

        {/* Run / action buttons */}
        {runResult === null && (
          <button
            onClick={run}
            disabled={running}
            style={{
              width:          "100%",
              padding:        "5px 10px",
              borderRadius:   6,
              border:         "none",
              background:     running ? P.muted : P.fg,
              color:          running ? P.placeholder : "#F7F7F4",
              fontSize:       11,
              fontWeight:     600,
              cursor:         running ? "not-allowed" : "pointer",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              gap:            5,
            }}
          >
            {running ? (
              <>
                <svg
                  className="animate-spin"
                  style={{ width: 11, height: 11 }}
                  fill="none" viewBox="0 0 24 24"
                >
                  <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4" />
                  <path style={{ opacity: 0.75 }} fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Running…
              </>
            ) : (
              <>
                <svg style={{ width: 11, height: 11 }} fill="none" viewBox="0 0 24 24"
                  stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Run tool
              </>
            )}
          </button>
        )}

        {/* Error */}
        {runError && (
          <div
            style={{
              marginTop:    runResult === null ? 6 : 0,
              padding:      "6px 8px",
              borderRadius: 5,
              background:   "rgba(239,68,68,0.06)",
              border:       "1px solid rgba(239,68,68,0.15)",
            }}
          >
            <p style={{ fontSize: 10, color: "#dc2626", lineHeight: 1.4 }}>{runError}</p>
            {runErrorCode && AUTH_ERROR_CODES.has(runErrorCode) && (
              <p style={{ fontSize: 10, marginTop: 4 }}>
                <a
                  href="/integrations"
                  style={{ color: "#dc2626", textDecoration: "underline" }}
                >
                  Go to Integrations to reconnect →
                </a>
              </p>
            )}
          </div>
        )}

        {/* Result */}
        {runResult !== null && (
          <div>
            <ResultSummary result={runResult} />
            <button
              onClick={handleInsert}
              style={{
                marginTop:    8,
                width:        "100%",
                padding:      "4px 10px",
                borderRadius: 5,
                border:       `1px solid ${P.border}`,
                background:   inserted ? "#f0fdf4" : P.muted,
                color:        inserted ? "#166534" : P.sub,
                fontSize:     10,
                fontWeight:   600,
                cursor:       "pointer",
              }}
            >
              {inserted ? "Inserted ✓" : "Insert into chat ↑"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
