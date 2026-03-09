"use client";

/**
 * app/agents/AgentsClient.tsx
 * Agent list + create UI.
 * "Build Agent" navigates to /agents/new (the full builder).
 */

import { useState, useEffect } from "react";
import { useRouter }           from "next/navigation";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Agent {
  id:            string;
  name:          string;
  description:   string;
  default_model: string;
  department:    string;
  updated_at:    string;
}

// ─── Palette ───────────────────────────────────────────────────────────────────

const P = {
  bg:     "#F7F7F4",
  card:   "#FFFFFF",
  border: "#E8E8E4",
  fg:     "#1A1A17",
  sub:    "#6B6B60",
  muted:  "#F0F0EC",
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AgentsClient() {
  const router = useRouter();

  const [agents,  setAgents]  = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d: { agents?: Agent[] }) => setAgents(d.agents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── styles ──────────────────────────────────────────────────────────────────
  const btnPrimary: React.CSSProperties = {
    padding:      "6px 14px",
    borderRadius: 7,
    border:       "none",
    background:   "#7C3AED",
    color:        "#fff",
    fontSize:     13,
    fontWeight:   600,
    cursor:       "pointer",
  };

  const btnSecondary: React.CSSProperties = {
    padding:      "6px 12px",
    borderRadius: 7,
    border:       `1px solid ${P.border}`,
    background:   P.muted,
    color:        P.fg,
    fontSize:     13,
    cursor:       "pointer",
  };

  const btnTalk: React.CSSProperties = {
    padding:        "4px 10px",
    borderRadius:   6,
    border:         "1px solid #7C3AED40",
    background:     "#7C3AED10",
    color:          "#7C3AED",
    fontSize:       12,
    fontWeight:     600,
    cursor:         "pointer",
    textDecoration: "none",
    whiteSpace:     "nowrap",
  };

  return (
    <div style={{ minHeight: "100vh", background: P.bg, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: P.fg }}>Agents</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: P.sub }}>
              Named AI agents with personality, soul, and tool access.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnSecondary} onClick={() => router.back()}>
              ← Back
            </button>
            <button style={btnPrimary} onClick={() => router.push("/agents/new")}>
              + Build Agent
            </button>
          </div>
        </div>

        {/* Agent list */}
        {loading ? (
          <p style={{ color: P.sub, fontSize: 13 }}>Loading…</p>
        ) : agents.length === 0 ? (
          <div
            style={{
              padding:      "48px 24px",
              background:   P.card,
              border:       `1px solid ${P.border}`,
              borderRadius: 12,
              textAlign:    "center",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
            <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: P.fg }}>No agents yet</p>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: P.sub }}>
              Build your first agent with a soul, skills, and personality.
            </p>
            <button style={btnPrimary} onClick={() => router.push("/agents/new")}>
              + Build Agent
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {agents.map((a) => {
              const talkHref = a.department
                ? `/agents/${a.department}/${a.id}`
                : `/agents/edit/${a.id}`;
              return (
                <div
                  key={a.id}
                  style={{
                    display:      "flex",
                    alignItems:   "center",
                    gap:          12,
                    padding:      "14px 16px",
                    background:   P.card,
                    border:       `1px solid ${P.border}`,
                    borderRadius: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: P.fg }}>{a.name}</div>
                    {a.description && (
                      <div style={{
                        fontSize:     12,
                        color:        P.sub,
                        marginTop:    2,
                        overflow:     "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace:   "nowrap",
                      }}>
                        {a.description}
                      </div>
                    )}
                    {a.department && (
                      <div style={{ fontSize: 11, color: "#a8a89c", marginTop: 2 }}>
                        {a.department}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, shrink: 0 } as React.CSSProperties}>
                    {a.default_model && (
                      <span style={{
                        fontSize:     11,
                        color:        P.sub,
                        background:   P.muted,
                        border:       `1px solid ${P.border}`,
                        borderRadius: 5,
                        padding:      "2px 7px",
                        whiteSpace:   "nowrap",
                      }}>
                        {a.default_model}
                      </span>
                    )}
                    <a href={talkHref} style={btnTalk}>
                      Talk →
                    </a>
                    <a
                      href={`/agents/edit/${a.id}`}
                      style={{ fontSize: 12, color: P.sub, whiteSpace: "nowrap", textDecoration: "none" }}
                    >
                      Edit →
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
