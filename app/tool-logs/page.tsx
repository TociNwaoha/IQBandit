/**
 * app/tool-logs/page.tsx
 * Protected page — shows the tool execution audit trail with optional filtering.
 *
 * Supported query params:
 *   provider_id=notion|meta_ads   — filter to one provider
 *   action=<action_id>            — filter to one action
 *   date=YYYY-MM-DD               — filter to a single UTC calendar day
 *   success=0 or 1                — 0 = errors only, 1 = successes only
 */

import { redirect }              from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import {
  listToolCalls,
  listLoggedProviders,
  type ToolCallFilters,
  type ToolCallEntry,
} from "@/lib/integrations/toolLogger";
import { listAgents } from "@/lib/agents";

export default async function ToolLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    provider_id?: string;
    action?:      string;
    date?:        string;
    success?:     string;
  }>;
}) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const sp = await searchParams;

  // Parse + validate query params; silently ignore malformed values.
  const filters: ToolCallFilters = {};

  const rawProvider = sp.provider_id?.trim();
  if (rawProvider) filters.provider_id = rawProvider;

  const rawAction = sp.action?.trim();
  if (rawAction) filters.action = rawAction;

  const rawDate = sp.date?.trim();
  if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) filters.date = rawDate;

  const rawSuccess = sp.success?.trim();
  if (rawSuccess === "0") filters.success = 0;
  else if (rawSuccess === "1") filters.success = 1;

  const isFiltered = !!(
    filters.provider_id ||
    filters.action ||
    filters.date ||
    filters.success !== undefined
  );

  const limit = isFiltered ? 500 : 100;
  const logs  = listToolCalls(filters, limit);

  // For the provider filter pill labels
  const knownProviders = listLoggedProviders();

  // Build agent id → name map for display
  const agentNameMap = new Map(listAgents().map((a) => [a.id, a.name]));

  // Build human-readable filter description
  const filterParts: string[] = [];
  if (filters.provider_id) filterParts.push(`provider: ${filters.provider_id}`);
  if (filters.action)      filterParts.push(`action: ${filters.action}`);
  if (filters.date)        filterParts.push(`date: ${filters.date}`);
  if (filters.success === 0) filterParts.push("errors only");
  else if (filters.success === 1) filterParts.push("successes only");
  const filterLabel = filterParts.join(" · ");

  // ── styles ────────────────────────────────────────────────────────────────
  const TD: React.CSSProperties = { padding: "5px 10px" };
  const TD_NW: React.CSSProperties = { ...TD, whiteSpace: "nowrap" };

  function providerUrl(pid: string) {
    const p = new URLSearchParams(sp as Record<string, string>);
    p.set("provider_id", pid);
    p.delete("action"); // reset action when provider changes
    return `/tool-logs?${p.toString()}`;
  }

  function clearUrl() {
    return "/tool-logs";
  }

  return (
    <main
      style={{
        padding: "24px",
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#1a1a17",
      }}
    >
      <h1 style={{ marginBottom: "4px", fontSize: "16px", fontWeight: 600 }}>
        Tool Call Logs
      </h1>
      <p style={{ marginBottom: "16px", color: "#6b6b60" }}>
        {isFiltered
          ? `Up to ${limit} results · stored in `
          : `Last ${logs.length} of up to ${limit} tool calls · stored in `}
        <code>logs/requests.db</code>
      </p>

      {/* Provider quick-filter pills */}
      {knownProviders.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            marginBottom: "12px",
          }}
        >
          {knownProviders.map((pid) => (
            <a
              key={pid}
              href={providerUrl(pid)}
              style={{
                padding: "3px 10px",
                borderRadius: "12px",
                border: "1px solid #d4d4cc",
                background:
                  filters.provider_id === pid ? "#1a1a17" : "#f7f7f4",
                color: filters.provider_id === pid ? "#fff" : "#1a1a17",
                textDecoration: "none",
                fontSize: "12px",
              }}
            >
              {pid}
            </a>
          ))}
        </div>
      )}

      {/* Active-filter bar */}
      {isFiltered && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "16px",
            padding: "6px 10px",
            background: "#f7f7f4",
            border: "1px solid #e8e8e4",
            borderRadius: "5px",
            fontSize: "12px",
          }}
        >
          <span style={{ color: "#6b6b60" }}>Filtered by:</span>
          <span style={{ color: "#1a1a17", fontWeight: 600 }}>
            {filterLabel}
          </span>
          <a
            href={clearUrl()}
            style={{
              marginLeft: "auto",
              color: "#6b6b60",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Clear filters
          </a>
        </div>
      )}

      {/* No data at all */}
      {logs.length === 0 && !isFiltered && (
        <p style={{ color: "#6b6b60" }}>
          No tool calls logged yet. Execute a tool from the{" "}
          <a
            href="/officebuilding"
            style={{ color: "#6b6b60", textDecoration: "underline" }}
          >
            Office Building
          </a>{" "}
          to generate one.
        </p>
      )}

      {/* No results for active filter */}
      {logs.length === 0 && isFiltered && (
        <div style={{ color: "#6b6b60" }}>
          <p>No tool calls match these filters.</p>
          <a
            href="/tool-logs"
            style={{ color: "#6b6b60", textDecoration: "underline" }}
          >
            Clear filters
          </a>
        </div>
      )}

      {/* Log table */}
      {logs.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              minWidth: "1050px",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid #e8e8e4" }}>
                {[
                  "timestamp",
                  "agent",
                  "provider",
                  "action",
                  "status",
                  "latency_ms",
                  "error_code",
                  "provider_error_code",
                  "message",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "6px 10px",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log: ToolCallEntry, i: number) => {
                const agentName = log.agent_id ? agentNameMap.get(log.agent_id) : undefined;
                return (
                  <tr
                    key={log.id}
                    style={{ background: i % 2 === 0 ? "#f7f7f4" : "#fff" }}
                  >
                    <td style={TD_NW}>
                      {log.timestamp
                        .replace("T", " ")
                        .replace(/\.\d+Z$/, " UTC")}
                    </td>
                    <td style={{ ...TD, color: log.agent_id ? "#1a1a17" : "#a8a89c" }}>
                      {log.agent_id
                        ? (agentName
                            ? <a href={`/agents/${log.agent_id}`} style={{ color: "#1a1a17", textDecoration: "underline" }}>{agentName}</a>
                            : <span title={log.agent_id}>{log.agent_id.slice(0, 8)}…</span>
                          )
                        : "—"}
                    </td>
                    <td style={TD}>
                      <a
                        href={`/tool-logs?provider_id=${log.provider_id}`}
                        style={{ color: "#1a1a17", textDecoration: "underline" }}
                      >
                        {log.provider_id}
                      </a>
                    </td>
                    <td style={TD}>
                      <a
                        href={`/tool-logs?provider_id=${log.provider_id}&action=${log.action}`}
                        style={{ color: "#1a1a17", textDecoration: "underline" }}
                      >
                        {log.action}
                      </a>
                    </td>
                    <td
                      style={{
                        ...TD,
                        color: log.success ? "#166534" : "#991b1b",
                        fontWeight: 600,
                      }}
                    >
                      {log.success ? "ok" : "err"}
                    </td>
                    <td style={{ ...TD, textAlign: "right" }}>
                      {log.latency_ms}
                    </td>
                    <td
                      style={{
                        ...TD,
                        color: log.error_code ? "#991b1b" : "#6b6b60",
                      }}
                    >
                      {log.error_code || "—"}
                    </td>
                    <td
                      style={{
                        ...TD,
                        color: log.provider_error_code ? "#991b1b" : "#6b6b60",
                      }}
                    >
                      {log.provider_error_code || "—"}
                    </td>
                    <td
                      style={{
                        ...TD,
                        color: log.message ? "#991b1b" : "#6b6b60",
                        maxWidth: "260px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={log.message}
                    >
                      {log.message || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
