"use client";

/**
 * app/officebuilding/ToolsPanel.tsx
 * Right-sidebar tools panel for the chat workspace.
 *
 * Fetches GET /api/integrations/tools on mount. Each action in the response
 * carries an `input_schema` (defined in lib/integrations/toolRouter.ts) that
 * drives the per-action form — no client-side schema duplication.
 *
 * Executes actions via POST /api/integrations/execute.
 * "Insert into chat ↑" appends a readable summary to the composer textarea.
 */

import { useState, useEffect }               from "react";
import type { InputFieldSchema }             from "@/lib/integrations/toolRouter";

// ─── API response types ───────────────────────────────────────────────────────

interface ActionItem {
  id:           string;
  display_name: string;
  description:  string;
  /** Served by /api/integrations/tools — matches InputFieldSchema. */
  input_schema: InputFieldSchema[];
}

interface ProviderItem {
  provider_id:   string;
  display_name:  string;
  connected:     boolean;
  account_label: string | null;
  actions:       ActionItem[];
}

interface ToolsResponse {
  providers:       ProviderItem[];
  total_connected: number;
}

// ─── Palette ──────────────────────────────────────────────────────────────────

const P = {
  bg:          "var(--color-bg-base)",
  card:        "var(--color-bg-surface)",
  muted:       "var(--color-bg-surface-2)",
  fg:          "var(--color-text-primary)",
  fgLight:     "var(--color-bg-base)",
  border:      "var(--color-border)",
  sub:         "var(--color-text-secondary)",
  placeholder: "var(--color-text-muted)",
} as const;

// ─── Result helpers ───────────────────────────────────────────────────────────

const ARRAY_KEYS = ["results", "accounts", "campaigns", "insights"] as const;

/** Find the primary data array in an action result, if present. */
function extractArray(obj: Record<string, unknown>): [string, unknown[]] | null {
  for (const key of ARRAY_KEYS) {
    if (Array.isArray(obj[key])) return [key, obj[key] as unknown[]];
  }
  return null;
}

/** Build a human-readable summary for inserting into the chat composer. */
function formatResultForInsert(
  providerId: string,
  action:     string,
  result:     unknown,
): string {
  const header = `[Tool result · ${providerId} / ${action}]`;

  if (!result || typeof result !== "object") {
    return `${header}\n${String(result)}`;
  }

  const obj  = result as Record<string, unknown>;
  const pair = extractArray(obj);

  if (!pair) {
    // Flat object (e.g., workspace info)
    const lines: string[] = [header];
    for (const [k, v] of Object.entries(obj)) {
      if (v !== null && v !== undefined && v !== "") lines.push(`${k}: ${String(v)}`);
    }
    return lines.join("\n");
  }

  const [key, items] = pair;
  const hasMore      = obj.has_more === true;
  const lines: string[] = [
    header,
    `${items.length} ${key}${hasMore ? " (more available)" : ""}:\n`,
  ];

  for (const item of items.slice(0, 10)) {
    if (!item || typeof item !== "object") { lines.push(`• ${String(item)}`); continue; }
    const row  = item as Record<string, unknown>;
    const name = row.name ?? row.title ?? row.campaign_name ?? row.adset_name ?? row.ad_name ?? null;
    const id   = row.id  ?? row.campaign_id ?? row.adset_id ?? row.ad_id ?? null;

    const parts: string[] = [];
    if (name) parts.push(String(name));
    if (id && String(id) !== String(name)) parts.push(`(${String(id)})`);

    for (const f of ["status", "currency", "spend", "impressions", "clicks", "ctr", "objective"]) {
      if (row[f] !== undefined && row[f] !== null && row[f] !== "") {
        parts.push(`${f}: ${String(row[f])}`);
      }
    }
    lines.push(`• ${parts.join(" · ")}`);
  }

  if (hasMore) lines.push(`\n(Increase limit to retrieve more records)`);
  return lines.join("\n");
}

// ─── ResultRow ────────────────────────────────────────────────────────────────

function ResultRow({ item }: { item: unknown }) {
  if (!item || typeof item !== "object") {
    return <div style={{ fontSize: 11, color: P.sub, padding: "4px 0" }}>{String(item)}</div>;
  }

  const row     = item as Record<string, unknown>;
  const nameKey = (
    ["name", "title", "campaign_name", "adset_name", "ad_name", "workspace_name"] as const
  ).find((k) => row[k]);
  const idKey   = (
    ["id", "campaign_id", "adset_id", "ad_id", "bot_id"] as const
  ).find((k) => row[k] && String(row[k]) !== String(nameKey ? row[nameKey] : ""));
  const metrics = (
    ["status", "currency", "spend", "impressions", "clicks", "ctr", "objective", "timezone_name"] as const
  ).filter((k) => row[k] !== undefined && row[k] !== null && row[k] !== "");

  return (
    <div
      style={{
        padding:      "6px 8px",
        borderRadius: 6,
        background:   P.bg,
        border:       `1px solid ${P.border}`,
        marginBottom: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        {nameKey && (
          <span style={{ fontSize: 11, fontWeight: 600, color: P.fg }}>{String(row[nameKey])}</span>
        )}
        {idKey && (
          <span style={{ fontSize: 10, color: P.placeholder, fontFamily: "monospace" }}>
            {String(row[idKey])}
          </span>
        )}
      </div>
      {metrics.length > 0 && (
        <div style={{ marginTop: 3, display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
          {metrics.slice(0, 4).map((k) => (
            <span key={k} style={{ fontSize: 10, color: P.sub }}>
              {k}: <span style={{ color: P.fg, fontWeight: 500 }}>{String(row[k])}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FieldInput ───────────────────────────────────────────────────────────────

/** Renders a single form field driven by InputFieldSchema. */
function FieldInput({
  field,
  value,
  onChange,
}: {
  field:    InputFieldSchema;
  value:    string;
  onChange: (val: string) => void;
}) {
  const baseStyle: React.CSSProperties = {
    width:        "100%",
    fontSize:     11,
    padding:      "4px 7px",
    borderRadius: 6,
    border:       `1px solid ${P.border}`,
    background:   P.bg,
    color:        P.fg,
    outline:      "none",
    boxSizing:    "border-box",
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <label
        style={{
          display:      "block",
          fontSize:     10,
          fontWeight:   600,
          color:        P.sub,
          marginBottom: 3,
        }}
      >
        {field.label}
        {field.required && <span style={{ color: "#dc2626", marginLeft: 2 }}>*</span>}
      </label>

      {field.type === "enum" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={baseStyle}
        >
          <option value="">— default —</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : field.type === "number" ? (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          style={baseStyle}
        />
      ) : (
        /* type === "string" */
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          maxLength={field.max_length}
          style={baseStyle}
        />
      )}

      {field.help && (
        <p style={{ fontSize: 10, color: P.placeholder, marginTop: 2, lineHeight: 1.4 }}>
          {field.help}
        </p>
      )}
    </div>
  );
}

// ─── ToolsPanel ───────────────────────────────────────────────────────────────

export function ToolsPanel({
  onInsert,
  agentId,
  conversationId,
  allowedActions,
}: {
  onInsert:        (text: string) => void;
  agentId?:        string;
  conversationId?: string;
  allowedActions?: Set<string> | null;
}) {
  // ── fetched data ────────────────────────────────────────────────────────────
  const [providers, setProviders]       = useState<ProviderItem[]>([]);
  const [loadingTools, setLoadingTools] = useState(true);

  // ── selection ───────────────────────────────────────────────────────────────
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedAction, setSelectedAction]     = useState<string | null>(null);

  // ── form values: key → raw string from the input ────────────────────────────
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // ── execution state ─────────────────────────────────────────────────────────
  const [executing, setExecuting]           = useState(false);
  const [result, setResult]                 = useState<unknown>(null);
  const [resultError, setResultError]       = useState<string | null>(null);
  const [resultErrorCode, setResultErrorCode] = useState<string | null>(null);
  const [showAll, setShowAll]               = useState(false);

  // ── fetch /api/integrations/tools on mount ──────────────────────────────────
  useEffect(() => {
    fetch("/api/integrations/tools")
      .then((r) => r.json())
      .then((data: ToolsResponse) => {
        const list = data.providers ?? [];
        setProviders(list);
        // Auto-select the first connected provider
        const first = list.find((p) => p.connected);
        if (first) setSelectedProvider(first.provider_id);
      })
      .catch(() => {})
      .finally(() => setLoadingTools(false));
  }, []);

  // ── derived: currently selected action object (carries input_schema) ─────────
  const currentAction = providers
    .find((p) => p.provider_id === selectedProvider)
    ?.actions.find((a) => a.id === selectedAction);

  // ── select an action (resets form + result) ─────────────────────────────────
  function selectAction(providerId: string, actionId: string) {
    setSelectedProvider(providerId);
    setSelectedAction(actionId);
    setFieldValues({});
    setResult(null);
    setResultError(null);
    setResultErrorCode(null);
    setShowAll(false);
  }

  // ── run action via /api/integrations/execute ─────────────────────────────────
  async function runAction() {
    if (!selectedProvider || !selectedAction || !currentAction) return;

    // Build typed input from raw field values (skip empty optional fields)
    const input: Record<string, string | number> = {};
    for (const f of currentAction.input_schema) {
      const raw = (fieldValues[f.key] ?? "").trim();
      if (raw === "") continue;
      if (f.type === "number") {
        const n = Number(raw);
        if (!isNaN(n)) input[f.key] = n;
      } else {
        input[f.key] = raw;
      }
    }

    setExecuting(true);
    setResult(null);
    setResultError(null);
    setResultErrorCode(null);
    setShowAll(false);

    try {
      const res  = await fetch("/api/integrations/execute", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          provider_id:     selectedProvider,
          action:          selectedAction,
          input,
          ...(conversationId ? { conversation_id: conversationId } : { agent_id: agentId ?? "" }),
        }),
      });
      const data = await res.json() as { result?: unknown; error?: string; code?: string };
      if (!res.ok) {
        setResultError(data.error ?? `Request failed (${res.status})`);
        setResultErrorCode(data.code ?? null);
      } else {
        setResult(data.result ?? null);
      }
    } catch {
      setResultError("Network error — could not reach the server.");
    } finally {
      setExecuting(false);
    }
  }

  // ── derived: filtered provider list ─────────────────────────────────────────
  const connectedProviders = providers.filter((p) => p.connected);
  const displayProviders = allowedActions
    ? connectedProviders
        .map((p) => ({
          ...p,
          actions: p.actions.filter((a) => allowedActions.has(`${p.provider_id}:${a.id}`)),
        }))
        .filter((p) => p.actions.length > 0)
    : connectedProviders;

  let resultItems: unknown[] | null = null;
  let resultHasMore                 = false;
  let resultIsScalar                = false;

  if (result !== null && typeof result === "object") {
    const obj  = result as Record<string, unknown>;
    const pair = extractArray(obj);
    if (pair) {
      resultItems   = pair[1];
      resultHasMore = obj.has_more === true;
    } else {
      resultIsScalar = true;
    }
  }

  const displayItems = resultItems
    ? (showAll ? resultItems : resultItems.slice(0, 5))
    : null;

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        width:         272,
        flexShrink:    0,
        display:       "flex",
        flexDirection: "column",
        background:    P.card,
        borderLeft:    `1px solid ${P.border}`,
        overflow:      "hidden",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding:        "11px 14px 10px",
          borderBottom:   `1px solid ${P.border}`,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          flexShrink:     0,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: P.fg }}>Tools</span>
        <span style={{ fontSize: 10, color: P.placeholder }}>
          {displayProviders.length} {allowedActions ? "allowed" : "connected"}
        </span>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>

        {/* Loading */}
        {loadingTools && (
          <p style={{ fontSize: 11, color: P.placeholder, textAlign: "center", paddingTop: 24 }}>
            Loading…
          </p>
        )}

        {/* No providers connected */}
        {!loadingTools && displayProviders.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 24 }}>
            <p style={{ fontSize: 11, color: P.sub }}>No providers connected.</p>
            <p style={{ fontSize: 10, color: P.placeholder, marginTop: 4, lineHeight: 1.5 }}>
              Go to{" "}
              <a href="/integrations" style={{ color: P.sub }}>Integrations</a>{" "}
              to connect Notion or Meta Ads.
            </p>
          </div>
        )}

        {/* Provider list — names only */}
        {!loadingTools && displayProviders.map((prov) => (
          <div
            key={prov.provider_id}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          6,
              padding:      "6px 8px",
              borderRadius: 6,
              border:       `1px solid ${P.border}`,
              background:   P.bg,
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: P.fg }}>
              {prov.display_name}
            </span>
            {prov.account_label && (
              <span style={{ fontSize: 10, color: P.placeholder }}>· {prov.account_label}</span>
            )}
          </div>
        ))}

      </div>
    </div>
  );
}
