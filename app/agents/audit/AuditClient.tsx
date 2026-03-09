"use client";

/**
 * app/agents/audit/AuditClient.tsx
 * Tool consent audit viewer — filterable pixel table.
 */

import { useState, useEffect, useCallback } from "react";
import type { Agent } from "@/lib/agents";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id:              string;
  conversation_id: string;
  agent_id:        string;
  tool:            "web" | "files";
  decision:        "allow_once" | "always_allow" | "deny";
  reason:          string;
  query:           string | null;
  created_at:      string;
}

interface Props {
  initialAgents: Agent[];
}

// ─── Palette ──────────────────────────────────────────────────────────────────

const P = {
  bg:      "#080812",
  surface: "#10102A",
  card:    "#14143A",
  border:  "#1E1E44",
  fg:      "#E2E2FF",
  sub:     "#6868A0",
  dim:     "#2A2A50",
  muted:   "#0D0D20",
  accent:  "#7C6FFF",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins   = Math.floor(diffMs / 60_000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function shortId(id: string): string {
  return id.slice(0, 8) + "…";
}

const DECISION_COLORS: Record<string, string> = {
  allow_once:   "#55EFC4",
  always_allow: "#55EFC4",
  deny:         "#FF6B6B",
};

const DECISION_LABELS: Record<string, string> = {
  allow_once:   "ALLOWED ONCE",
  always_allow: "ALWAYS ALLOWED",
  deny:         "DENIED",
};

const TOOL_LABELS: Record<string, string> = {
  web:   "WEB",
  files: "FILES",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AuditClient({ initialAgents }: Props) {
  const [entries,      setEntries]      = useState<AuditEntry[]>([]);
  const [loading,      setLoading]      = useState(true);

  // Filters
  const [filterAgent,    setFilterAgent]    = useState("");
  const [filterTool,     setFilterTool]     = useState("");
  const [filterDecision, setFilterDecision] = useState("");
  const [filterConvId,   setFilterConvId]   = useState("");

  // Agent id → agent map for quick lookup
  const agentMap = Object.fromEntries(initialAgents.map((a) => [a.id, a]));

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (filterAgent)    params.set("agentId",        filterAgent);
    if (filterTool)     params.set("tool",           filterTool);
    if (filterDecision) params.set("decision",       filterDecision);
    if (filterConvId.trim()) params.set("conversationId", filterConvId.trim());

    try {
      const res = await fetch(`/api/tool-audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json() as { entries?: AuditEntry[] };
        setEntries(data.entries ?? []);
      }
    } catch {}
    setLoading(false);
  }, [filterAgent, filterTool, filterDecision, filterConvId]);

  useEffect(() => { void load(); }, [load]);

  // Build the "Open chat" link for a row
  function chatLink(entry: AuditEntry): string | null {
    const agent = agentMap[entry.agent_id];
    if (!agent || !agent.department) return null;
    const base = `/agents/${encodeURIComponent(agent.department)}/${encodeURIComponent(agent.id)}`;
    return entry.conversation_id ? `${base}?c=${entry.conversation_id}` : base;
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const selectStyle: React.CSSProperties = {
    fontFamily:      "var(--font-pixel, monospace)",
    fontSize:        6,
    color:           P.fg,
    background:      P.surface,
    border:          `1px solid ${P.border}`,
    padding:         "5px 8px",
    letterSpacing:   "0.08em",
    cursor:          "pointer",
    outline:         "none",
  };

  const inputStyle: React.CSSProperties = {
    fontFamily:    "monospace",
    fontSize:      11,
    color:         P.fg,
    background:    P.surface,
    border:        `1px solid ${P.border}`,
    padding:       "5px 8px",
    outline:       "none",
    width:         180,
  };

  const thStyle: React.CSSProperties = {
    fontFamily:    "var(--font-pixel, monospace)",
    fontSize:      5,
    color:         P.sub,
    letterSpacing: "0.15em",
    padding:       "8px 12px",
    textAlign:     "left" as const,
    borderBottom:  `1px solid ${P.border}`,
    whiteSpace:    "nowrap" as const,
  };

  const tdStyle: React.CSSProperties = {
    padding:      "8px 12px",
    fontFamily:   "monospace",
    fontSize:     11,
    color:        P.fg,
    borderBottom: `1px solid ${P.dim}`,
    verticalAlign: "top",
  };

  return (
    <div style={{ minHeight: "100vh", background: P.bg, color: P.fg }}>

      {/* Top colour bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${P.accent}, #4A3FCC, transparent)` }} />

      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${P.border}`,
        padding: "20px 32px",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
        <a href="/agents/list" style={{
          fontFamily: "var(--font-pixel, monospace)", fontSize: 7, color: P.sub,
          textDecoration: "none", border: `1px solid ${P.border}`,
          padding: "5px 9px", letterSpacing: "0.12em",
        }}>← AGENTS</a>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--font-pixel, monospace)", fontSize: 9, color: P.accent,
            letterSpacing: "0.1em", textShadow: `0 0 12px ${P.accent}66`,
          }}>TOOL AUDIT LOG</div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: P.sub, marginTop: 4 }}>
            Tool consent decisions — allow, always allow, deny
          </div>
        </div>

        <div style={{
          fontFamily: "var(--font-pixel, monospace)", fontSize: 6, color: P.sub,
          letterSpacing: "0.1em",
        }}>{entries.length} RECORDS</div>
      </div>

      {/* Filters */}
      <div style={{
        padding: "14px 32px",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        borderBottom: `1px solid ${P.border}`,
        background: P.muted,
      }}>
        <div style={{
          fontFamily: "var(--font-pixel, monospace)", fontSize: 5, color: P.sub,
          letterSpacing: "0.15em", marginRight: 4,
        }}>FILTERS</div>

        {/* Agent filter */}
        <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)} style={selectStyle}>
          <option value="">All agents</option>
          {initialAgents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        {/* Tool filter */}
        <select value={filterTool} onChange={(e) => setFilterTool(e.target.value)} style={selectStyle}>
          <option value="">All tools</option>
          <option value="web">Web Search</option>
          <option value="files">File Search</option>
        </select>

        {/* Decision filter */}
        <select value={filterDecision} onChange={(e) => setFilterDecision(e.target.value)} style={selectStyle}>
          <option value="">All decisions</option>
          <option value="allow_once">Allowed once</option>
          <option value="always_allow">Always allowed</option>
          <option value="deny">Denied</option>
        </select>

        {/* Conversation ID filter */}
        <input
          type="text"
          value={filterConvId}
          onChange={(e) => setFilterConvId(e.target.value)}
          placeholder="Conversation ID…"
          style={inputStyle}
        />

        {/* Reset */}
        {(filterAgent || filterTool || filterDecision || filterConvId) && (
          <button
            onClick={() => {
              setFilterAgent("");
              setFilterTool("");
              setFilterDecision("");
              setFilterConvId("");
            }}
            style={{
              fontFamily: "var(--font-pixel, monospace)", fontSize: 5, letterSpacing: "0.1em",
              color: P.sub, background: "transparent", border: `1px solid ${P.border}`,
              padding: "5px 8px", cursor: "pointer",
            }}
          >✕ CLEAR</button>
        )}
      </div>

      {/* Table */}
      <div style={{ padding: "24px 32px" }}>
        {loading ? (
          <div style={{
            fontFamily: "var(--font-pixel, monospace)", fontSize: 7, color: P.sub,
            letterSpacing: "0.15em", padding: "40px 0", textAlign: "center",
          }}>LOADING…</div>
        ) : entries.length === 0 ? (
          <div style={{
            fontFamily: "var(--font-pixel, monospace)", fontSize: 7, color: P.dim,
            letterSpacing: "0.15em", padding: "40px 0", textAlign: "center",
          }}>NO RECORDS FOUND</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%", borderCollapse: "collapse",
              border: `1px solid ${P.border}`,
            }}>
              <thead>
                <tr style={{ background: P.surface }}>
                  <th style={thStyle}>TIME</th>
                  <th style={thStyle}>AGENT</th>
                  <th style={thStyle}>TOOL</th>
                  <th style={thStyle}>DECISION</th>
                  <th style={thStyle}>QUERY</th>
                  <th style={thStyle}>REASON</th>
                  <th style={thStyle}>CONVERSATION</th>
                  <th style={thStyle}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const agent      = agentMap[entry.agent_id];
                  const link       = chatLink(entry);
                  const decColor   = DECISION_COLORS[entry.decision] ?? P.sub;
                  const decLabel   = DECISION_LABELS[entry.decision] ?? entry.decision;
                  const toolLabel  = TOOL_LABELS[entry.tool] ?? entry.tool.toUpperCase();

                  return (
                    <tr key={entry.id} style={{ background: P.bg }}>
                      {/* Time */}
                      <td style={{ ...tdStyle, color: P.sub, whiteSpace: "nowrap" }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: P.sub }}>
                          {timeAgo(entry.created_at)}
                        </div>
                        <div style={{ fontFamily: "monospace", fontSize: 9, color: P.dim, marginTop: 2 }}>
                          {entry.created_at.slice(0, 19).replace("T", " ")}
                        </div>
                      </td>

                      {/* Agent */}
                      <td style={tdStyle}>
                        {agent ? (
                          <>
                            <div style={{ fontFamily: "var(--font-pixel, monospace)", fontSize: 6, color: P.accent, letterSpacing: "0.06em" }}>
                              {agent.name}
                            </div>
                            <div style={{ fontFamily: "monospace", fontSize: 9, color: P.sub, marginTop: 2 }}>
                              {agent.department || "—"}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: P.dim }}>{shortId(entry.agent_id)}</span>
                        )}
                      </td>

                      {/* Tool */}
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        <span style={{
                          fontFamily: "var(--font-pixel, monospace)", fontSize: 5, letterSpacing: "0.08em",
                          color: P.accent, border: `1px solid ${P.accent}44`,
                          background: `${P.accent}0D`, padding: "2px 6px",
                        }}>{toolLabel}</span>
                      </td>

                      {/* Decision */}
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        <span style={{
                          fontFamily: "var(--font-pixel, monospace)", fontSize: 5, letterSpacing: "0.08em",
                          color: decColor, border: `1px solid ${decColor}44`,
                          background: `${decColor}0D`, padding: "2px 6px",
                        }}>{decLabel}</span>
                      </td>

                      {/* Query */}
                      <td style={{ ...tdStyle, maxWidth: 200 }}>
                        {entry.query ? (
                          <div style={{
                            fontFamily: "monospace", fontSize: 10, color: P.sub,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            maxWidth: 180,
                          }} title={entry.query}>
                            {entry.query}
                          </div>
                        ) : (
                          <span style={{ color: P.dim }}>—</span>
                        )}
                      </td>

                      {/* Reason */}
                      <td style={{ ...tdStyle, maxWidth: 220 }}>
                        <div style={{
                          fontFamily: "monospace", fontSize: 10, color: P.sub,
                          whiteSpace: "normal", lineHeight: 1.4,
                        }}>
                          {entry.reason || "—"}
                        </div>
                      </td>

                      {/* Conversation ID */}
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        {entry.conversation_id ? (
                          <span style={{ fontFamily: "monospace", fontSize: 10, color: P.dim }}>
                            {shortId(entry.conversation_id)}
                          </span>
                        ) : (
                          <span style={{ color: P.dim }}>—</span>
                        )}
                      </td>

                      {/* Open chat link */}
                      <td style={tdStyle}>
                        {link ? (
                          <a
                            href={link}
                            style={{
                              fontFamily: "var(--font-pixel, monospace)", fontSize: 5,
                              color: P.accent, textDecoration: "none",
                              border: `1px solid ${P.accent}44`, padding: "3px 7px",
                              letterSpacing: "0.08em", whiteSpace: "nowrap",
                            }}
                          >OPEN CHAT →</a>
                        ) : (
                          <span style={{ color: P.dim }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
