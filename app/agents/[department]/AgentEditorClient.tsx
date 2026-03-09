"use client";

/**
 * app/agents/[id]/AgentEditorClient.tsx
 * Two-section editor: agent config form + tool allowlist checkboxes.
 */

import { useState, useEffect, useCallback } from "react";
import type { Agent, AgentToolEntry }        from "@/lib/agents";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ToolAction {
  id:    string;
  label: string;
}

interface SlimProvider {
  provider_id: string;
  label:       string;
  connected:   boolean;
  actions:     ToolAction[];
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Convert AgentToolEntry[] to a flat Set of "provider_id:action_id" and a Set of wildcard provider_ids. */
function toolsToSets(tools: AgentToolEntry[]): {
  wildcards: Set<string>;
  specific:  Set<string>;
} {
  const wildcards = new Set<string>();
  const specific  = new Set<string>();
  for (const t of tools) {
    if (t.action_ids === "*") {
      wildcards.add(t.provider_id);
    } else {
      for (const aid of t.action_ids) specific.add(`${t.provider_id}:${aid}`);
    }
  }
  return { wildcards, specific };
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  agent:        Agent;
  initialTools: AgentToolEntry[];
}

export default function AgentEditorClient({ agent, initialTools }: Props) {
  // ── Config form state ─────────────────────────────────────────────────────
  const [name,          setName]          = useState(agent.name);
  const [description,   setDescription]   = useState(agent.description);
  const [systemPrompt,  setSystemPrompt]  = useState(agent.system_prompt);
  const [defaultModel,  setDefaultModel]  = useState(agent.default_model);
  const [configSaving,  setConfigSaving]  = useState(false);
  const [configSaved,   setConfigSaved]   = useState(false);
  const [configErr,     setConfigErr]     = useState<string | null>(null);

  // ── Tool allowlist state ──────────────────────────────────────────────────
  const [providers,     setProviders]     = useState<SlimProvider[]>([]);
  const [wildcards,     setWildcards]     = useState<Set<string>>(() => toolsToSets(initialTools).wildcards);
  const [specific,      setSpecific]      = useState<Set<string>>(() => toolsToSets(initialTools).specific);
  const [toolsSaving,   setToolsSaving]   = useState(false);
  const [toolsSaved,    setToolsSaved]    = useState(false);
  const [toolsErr,      setToolsErr]      = useState<string | null>(null);

  // ── fetch connected providers ─────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/integrations/tools")
      .then((r) => r.json())
      .then((d: { providers?: SlimProvider[] }) => setProviders(d.providers ?? []))
      .catch(() => {});
  }, []);

  // ── save config ───────────────────────────────────────────────────────────
  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setConfigSaving(true);
    setConfigErr(null);
    setConfigSaved(false);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, description, system_prompt: systemPrompt, default_model: defaultModel }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setConfigErr(data.error ?? "Save failed"); return; }
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch {
      setConfigErr("Network error");
    } finally {
      setConfigSaving(false);
    }
  }

  // ── toggle wildcard for a provider ────────────────────────────────────────
  const toggleWildcard = useCallback((providerId: string, checked: boolean) => {
    setWildcards((prev) => {
      const next = new Set(prev);
      if (checked) next.add(providerId); else next.delete(providerId);
      return next;
    });
    setToolsSaved(false);
  }, []);

  // ── toggle specific action ────────────────────────────────────────────────
  const toggleAction = useCallback((key: string, checked: boolean) => {
    setSpecific((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
    setToolsSaved(false);
  }, []);

  // ── save tools ────────────────────────────────────────────────────────────
  async function saveTools(e: React.FormEvent) {
    e.preventDefault();
    setToolsSaving(true);
    setToolsErr(null);
    setToolsSaved(false);

    // Build flat rules array
    const rules: { provider_id: string; action_id: string }[] = [];
    for (const pid of wildcards) {
      rules.push({ provider_id: pid, action_id: "*" });
    }
    for (const key of specific) {
      const [pid, aid] = key.split(":");
      // Skip if already covered by wildcard
      if (!wildcards.has(pid)) rules.push({ provider_id: pid, action_id: aid });
    }

    try {
      const res = await fetch(`/api/agents/${agent.id}/tools`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ rules }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setToolsErr(data.error ?? "Save failed"); return; }
      setToolsSaved(true);
    } catch {
      setToolsErr("Network error");
    } finally {
      setToolsSaving(false);
    }
  }

  // ── styles ────────────────────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = {
    display:      "block",
    fontSize:     12,
    fontWeight:   600,
    color:        P.sub,
    marginBottom: 4,
  };

  const inputStyle: React.CSSProperties = {
    width:        "100%",
    fontSize:     13,
    padding:      "7px 10px",
    borderRadius: 7,
    border:       `1px solid ${P.border}`,
    background:   P.bg,
    color:        P.fg,
    outline:      "none",
    boxSizing:    "border-box",
  };

  const btnPrimary: React.CSSProperties = {
    padding:      "7px 18px",
    borderRadius: 7,
    border:       "none",
    background:   P.fg,
    color:        "#fff",
    fontSize:     13,
    fontWeight:   600,
    cursor:       "pointer",
  };

  const sectionCard: React.CSSProperties = {
    background:   P.card,
    border:       `1px solid ${P.border}`,
    borderRadius: 12,
    padding:      "24px",
    marginBottom: 20,
  };

  const connectedProviders = providers.filter((p) => p.connected);

  return (
    <div style={{ minHeight: "100vh", background: P.bg, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <a href="/agents" style={{ fontSize: 13, color: P.sub, textDecoration: "none" }}>
            ← Agents
          </a>
          <span style={{ color: P.border }}>/</span>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: P.fg }}>{agent.name}</h1>
        </div>

        {/* ── Section 1: Config form ───────────────────────────────────────── */}
        <form onSubmit={saveConfig} style={sectionCard}>
          <h2 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: P.fg }}>
            Configuration
          </h2>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional short description"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Override the model's default system prompt for this agent…"
              rows={5}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Default Model</label>
            <input
              type="text"
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              placeholder="e.g. openclaw:main"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="submit" disabled={configSaving || !name.trim()} style={btnPrimary}>
              {configSaving ? "Saving…" : "Save config"}
            </button>
            {configSaved && (
              <span style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>Saved ✓</span>
            )}
            {configErr && (
              <span style={{ fontSize: 12, color: "#dc2626" }}>{configErr}</span>
            )}
          </div>
        </form>

        {/* ── Section 2: Tool allowlist ────────────────────────────────────── */}
        <form onSubmit={saveTools} style={sectionCard}>
          <h2 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: P.fg }}>
            Tool Allowlist
          </h2>
          <p style={{ margin: "0 0 20px", fontSize: 12, color: P.sub }}>
            Only checked tools will be available when this agent is active.
            Leave all unchecked to block all tools.
          </p>

          {connectedProviders.length === 0 ? (
            <p style={{ fontSize: 13, color: P.sub }}>
              No providers connected yet.{" "}
              <a href="/integrations" style={{ color: P.sub, textDecoration: "underline" }}>
                Connect one in Integrations →
              </a>
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {connectedProviders.map((p) => {
                const isWild = wildcards.has(p.provider_id);
                return (
                  <div key={p.provider_id}>
                    {/* Provider row — wildcard toggle */}
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={isWild}
                        onChange={(e) => toggleWildcard(p.provider_id, e.target.checked)}
                      />
                      <span style={{ fontWeight: 600, fontSize: 13, color: P.fg }}>
                        Allow all {p.label} actions
                      </span>
                    </label>

                    {/* Per-action checkboxes — only when wildcard is off */}
                    {!isWild && (
                      <div style={{ paddingLeft: 22, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                        {p.actions.map((a) => {
                          const key     = `${p.provider_id}:${a.id}`;
                          const checked = specific.has(key);
                          return (
                            <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => toggleAction(key, e.target.checked)}
                              />
                              <span style={{ fontSize: 13, color: P.fg }}>{a.label}</span>
                              <span style={{ fontSize: 11, color: P.sub, fontFamily: "monospace" }}>{a.id}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 24 }}>
            <button type="submit" disabled={toolsSaving} style={btnPrimary}>
              {toolsSaving ? "Saving…" : "Save tools"}
            </button>
            {toolsSaved && (
              <span style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>Tools saved ✓</span>
            )}
            {toolsErr && (
              <span style={{ fontSize: 12, color: "#dc2626" }}>{toolsErr}</span>
            )}
          </div>
        </form>

      </div>
    </div>
  );
}
