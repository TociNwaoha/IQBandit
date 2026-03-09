"use client";

/**
 * app/agents/edit/[id]/AgentEditorClient.tsx
 * Two-section editor: agent config form + tool allowlist checkboxes.
 *
 * v8: per-setting "Override department policy" toggles.
 *     When override is off the control is disabled and shows the inherited value.
 *     When override is on the control is enabled and the agent value wins.
 */

import { useState, useEffect, useCallback } from "react";
import type { Agent, AgentToolEntry, ResponseStyle } from "@/lib/agents";
import type { DepartmentPolicy } from "@/lib/departmentPolicies";

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
  bg:       "#F7F7F4",
  card:     "#FFFFFF",
  border:   "#E8E8E4",
  fg:       "#1A1A17",
  sub:      "#6B6B60",
  muted:    "#F0F0EC",
  inherit:  "#2563EB",
  override: "#059669",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function styleLabel(s: ResponseStyle): string {
  if (s === "brief")    return "Brief";
  if (s === "detailed") return "Detailed";
  return "Balanced";
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  agent:            Agent;
  initialTools:     AgentToolEntry[];
  departmentPolicy: DepartmentPolicy | null;
}

export default function AgentEditorClient({ agent, initialTools, departmentPolicy }: Props) {
  const hasDept = !!departmentPolicy;

  // ── Config form state ─────────────────────────────────────────────────────
  const [name,           setName]           = useState(agent.name);
  const [description,    setDescription]    = useState(agent.description);
  const [systemPrompt,   setSystemPrompt]   = useState(agent.system_prompt);
  const [defaultModel,   setDefaultModel]   = useState(agent.default_model);

  // Behaviour settings (agent-level values)
  const [allowWeb,       setAllowWeb]       = useState(agent.allow_web);
  const [allowFiles,     setAllowFiles]     = useState(agent.allow_files);
  const [askBeforeTools, setAskBeforeTools] = useState(agent.ask_before_tools);
  const [askBeforeWeb,   setAskBeforeWeb]   = useState(agent.ask_before_web);
  const [askBeforeFiles, setAskBeforeFiles] = useState(agent.ask_before_files);
  const [responseStyle,  setResponseStyle]  = useState<ResponseStyle>(agent.response_style);

  // Override flags
  const [ovAllowWeb,        setOvAllowWeb]        = useState(agent.override_allow_web);
  const [ovAllowFiles,      setOvAllowFiles]       = useState(agent.override_allow_files);
  const [ovAskBeforeTools,  setOvAskBeforeTools]   = useState(agent.override_ask_before_tools);
  const [ovAskBeforeWeb,    setOvAskBeforeWeb]     = useState(agent.override_ask_before_web);
  const [ovAskBeforeFiles,  setOvAskBeforeFiles]   = useState(agent.override_ask_before_files);
  const [ovResponseStyle,   setOvResponseStyle]    = useState(agent.override_response_style);

  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved,  setConfigSaved]  = useState(false);
  const [configErr,    setConfigErr]    = useState<string | null>(null);

  // ── Tool allowlist state ──────────────────────────────────────────────────
  const [providers,   setProviders]   = useState<SlimProvider[]>([]);
  const [wildcards,   setWildcards]   = useState<Set<string>>(() => toolsToSets(initialTools).wildcards);
  const [specific,    setSpecific]    = useState<Set<string>>(() => toolsToSets(initialTools).specific);
  const [toolsSaving, setToolsSaving] = useState(false);
  const [toolsSaved,  setToolsSaved]  = useState(false);
  const [toolsErr,    setToolsErr]    = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/integrations/tools")
      .then((r) => r.json())
      .then((d: { providers?: SlimProvider[] }) => setProviders(d.providers ?? []))
      .catch(() => {});
  }, []);

  // ── Derive effective values ───────────────────────────────────────────────
  const effAllowWeb       = hasDept && !ovAllowWeb        ? (departmentPolicy!.allow_web)        : allowWeb;
  const effAllowFiles     = hasDept && !ovAllowFiles      ? (departmentPolicy!.allow_files)      : allowFiles;
  const effAskBefore      = hasDept && !ovAskBeforeTools  ? (departmentPolicy!.ask_before_tools) : askBeforeTools;
  const effAskBeforeWeb   = hasDept && !ovAskBeforeWeb    ? (departmentPolicy!.ask_before_web)   : askBeforeWeb;
  const effAskBeforeFiles = hasDept && !ovAskBeforeFiles  ? (departmentPolicy!.ask_before_files) : askBeforeFiles;
  const effResponseStyle  = hasDept && !ovResponseStyle   ? (departmentPolicy!.response_style)   : responseStyle;

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
        body:    JSON.stringify({
          name, description, system_prompt: systemPrompt, default_model: defaultModel,
          allow_web: allowWeb, allow_files: allowFiles,
          ask_before_tools: askBeforeTools,
          ask_before_web: askBeforeWeb, ask_before_files: askBeforeFiles,
          response_style: responseStyle,
          override_allow_web:        ovAllowWeb,
          override_allow_files:      ovAllowFiles,
          override_ask_before_tools: ovAskBeforeTools,
          override_ask_before_web:   ovAskBeforeWeb,
          override_ask_before_files: ovAskBeforeFiles,
          override_response_style:   ovResponseStyle,
        }),
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

  const toggleWildcard = useCallback((providerId: string, checked: boolean) => {
    setWildcards((prev) => {
      const next = new Set(prev);
      if (checked) next.add(providerId); else next.delete(providerId);
      return next;
    });
    setToolsSaved(false);
  }, []);

  const toggleAction = useCallback((key: string, checked: boolean) => {
    setSpecific((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
    setToolsSaved(false);
  }, []);

  async function saveTools(e: React.FormEvent) {
    e.preventDefault();
    setToolsSaving(true);
    setToolsErr(null);
    setToolsSaved(false);

    const rules: { provider_id: string; action_id: string }[] = [];
    for (const pid of wildcards) rules.push({ provider_id: pid, action_id: "*" });
    for (const key of specific) {
      const [pid, aid] = key.split(":");
      if (!wildcards.has(pid)) rules.push({ provider_id: pid, action_id: aid });
    }

    try {
      const res = await fetch(`/api/agents/${agent.id}/tools`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
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

  // ── Styles ───────────────────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 12, fontWeight: 600, color: P.sub, marginBottom: 4,
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", fontSize: 13, padding: "7px 10px", borderRadius: 7,
    border: `1px solid ${P.border}`, background: P.bg, color: P.fg,
    outline: "none", boxSizing: "border-box",
  };
  const inputDisabled: React.CSSProperties = {
    ...inputStyle, background: P.muted, color: P.sub, cursor: "not-allowed",
  };
  const btnPrimary: React.CSSProperties = {
    padding: "7px 18px", borderRadius: 7, border: "none",
    background: P.fg, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
  };
  const sectionCard: React.CSSProperties = {
    background: P.card, border: `1px solid ${P.border}`,
    borderRadius: 12, padding: "24px", marginBottom: 20,
  };

  const connectedProviders = providers.filter((p) => p.connected);

  // ── Override row subcomponent ─────────────────────────────────────────────
  function OverrideTag({ on, policyDisplay }: { on: boolean; policyDisplay: string }) {
    if (!hasDept) return null;
    return (
      <span style={{
        fontSize: 10, fontWeight: 600,
        color: on ? P.override : P.inherit,
        background: on ? "#ECFDF5" : "#EFF6FF",
        border: `1px solid ${on ? "#A7F3D0" : "#BFDBFE"}`,
        borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap",
      }}>
        {on ? "Overridden" : `Inherited: ${policyDisplay}`}
      </span>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: P.bg, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <a href="/agents/list" style={{ fontSize: 13, color: P.sub, textDecoration: "none" }}>
            ← Agents
          </a>
          <span style={{ color: P.border }}>/</span>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: P.fg }}>{agent.name}</h1>
        </div>

        {/* Department notice */}
        {hasDept && (
          <div style={{
            background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8,
            padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#1E40AF",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span>🏢</span>
            <span>
              In <strong>{agent.department}</strong> dept. Settings without "Override" active are
              inherited from the{" "}
              <a href="/agents/policy" style={{ color: "#1E40AF", fontWeight: 600 }}>
                department policy →
              </a>
            </span>
          </div>
        )}

        {/* ── Section 1: Config ─────────────────────────────────────────────── */}
        <form onSubmit={saveConfig} style={sectionCard}>
          <h2 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: P.fg }}>
            Configuration
          </h2>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              required style={inputStyle} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional short description" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>System Prompt</label>
            <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Override the model's default system prompt for this agent…" rows={5}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Default Model</label>
            <input type="text" value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)}
              placeholder="e.g. openclaw:main" style={inputStyle} />
          </div>

          {/* ── Behaviour settings ─────────────────────────────────────────── */}
          <div style={{ borderTop: `1px solid ${P.border}`, paddingTop: 16, marginBottom: 20 }}>
            <p style={{ margin: "0 0 14px", fontSize: 12, fontWeight: 600, color: P.sub }}>
              Behaviour Settings
              {hasDept && (
                <span style={{ fontWeight: 400, marginLeft: 6 }}>
                  — toggle "Override" to diverge from department policy
                </span>
              )}
            </p>

            {/* Allow web */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: !hasDept || ovAllowWeb ? "pointer" : "default" }}>
                  <input type="checkbox" checked={effAllowWeb}
                    disabled={hasDept && !ovAllowWeb}
                    onChange={(e) => setAllowWeb(e.target.checked)} />
                  <span style={{ fontSize: 13, color: P.fg }}>Allow web browsing</span>
                  <span style={{ fontSize: 11, color: P.sub }}>— agent may search the internet</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", marginLeft: "auto" }}>
                  {hasDept && <input type="checkbox" checked={ovAllowWeb} onChange={(e) => setOvAllowWeb(e.target.checked)} />}
                  <OverrideTag on={ovAllowWeb} policyDisplay={departmentPolicy?.allow_web ? "ON" : "OFF"} />
                </label>
              </div>
            </div>

            {/* Allow files */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: !hasDept || ovAllowFiles ? "pointer" : "default" }}>
                  <input type="checkbox" checked={effAllowFiles}
                    disabled={hasDept && !ovAllowFiles}
                    onChange={(e) => setAllowFiles(e.target.checked)} />
                  <span style={{ fontSize: 13, color: P.fg }}>Allow file access</span>
                  <span style={{ fontSize: 11, color: P.sub }}>— agent may read from files</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", marginLeft: "auto" }}>
                  {hasDept && <input type="checkbox" checked={ovAllowFiles} onChange={(e) => setOvAllowFiles(e.target.checked)} />}
                  <OverrideTag on={ovAllowFiles} policyDisplay={departmentPolicy?.allow_files ? "ON" : "OFF"} />
                </label>
              </div>
            </div>

            {/* Ask before tools */}
            <div style={{ marginBottom: effAskBefore ? 8 : 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: !hasDept || ovAskBeforeTools ? "pointer" : "default" }}>
                  <input type="checkbox" checked={effAskBefore}
                    disabled={hasDept && !ovAskBeforeTools}
                    onChange={(e) => setAskBeforeTools(e.target.checked)} />
                  <span style={{ fontSize: 13, color: P.fg }}>Ask before using tools</span>
                  <span style={{ fontSize: 11, color: P.sub }}>— agent confirms before tool calls</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", marginLeft: "auto" }}>
                  {hasDept && <input type="checkbox" checked={ovAskBeforeTools} onChange={(e) => setOvAskBeforeTools(e.target.checked)} />}
                  <OverrideTag on={ovAskBeforeTools} policyDisplay={departmentPolicy?.ask_before_tools ? "ON" : "OFF"} />
                </label>
              </div>
            </div>

            {/* Per-tool sub-toggles */}
            {effAskBefore && (
              <div style={{
                paddingLeft: 22, marginBottom: 14,
                borderLeft: `2px solid ${P.border}`,
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ fontSize: 11, color: P.sub, marginBottom: 2 }}>
                  Which tools require confirmation?
                </div>

                {/* Ask before web */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: !hasDept || ovAskBeforeWeb ? "pointer" : "default" }}>
                      <input type="checkbox" checked={effAskBeforeWeb}
                        disabled={hasDept && !ovAskBeforeWeb}
                        onChange={(e) => setAskBeforeWeb(e.target.checked)} />
                      <span style={{ fontSize: 12, color: P.fg }}>Ask before Web Search</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", marginLeft: "auto" }}>
                      {hasDept && <input type="checkbox" checked={ovAskBeforeWeb} onChange={(e) => setOvAskBeforeWeb(e.target.checked)} />}
                      <OverrideTag on={ovAskBeforeWeb} policyDisplay={departmentPolicy?.ask_before_web ? "ON" : "OFF"} />
                    </label>
                  </div>
                </div>

                {/* Ask before files */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: !hasDept || ovAskBeforeFiles ? "pointer" : "default" }}>
                      <input type="checkbox" checked={effAskBeforeFiles}
                        disabled={hasDept && !ovAskBeforeFiles}
                        onChange={(e) => setAskBeforeFiles(e.target.checked)} />
                      <span style={{ fontSize: 12, color: P.fg }}>Ask before File Access</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", marginLeft: "auto" }}>
                      {hasDept && <input type="checkbox" checked={ovAskBeforeFiles} onChange={(e) => setOvAskBeforeFiles(e.target.checked)} />}
                      <OverrideTag on={ovAskBeforeFiles} policyDisplay={departmentPolicy?.ask_before_files ? "ON" : "OFF"} />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Response style */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Response Style</label>
                <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", marginLeft: "auto" }}>
                  {hasDept && <input type="checkbox" checked={ovResponseStyle} onChange={(e) => setOvResponseStyle(e.target.checked)} />}
                  <OverrideTag on={ovResponseStyle}
                    policyDisplay={styleLabel(departmentPolicy?.response_style ?? "balanced")} />
                </label>
              </div>
              <select
                value={effResponseStyle}
                disabled={hasDept && !ovResponseStyle}
                onChange={(e) => setResponseStyle(e.target.value as ResponseStyle)}
                style={{ ...(hasDept && !ovResponseStyle ? inputDisabled : inputStyle), width: "auto", paddingRight: 24 }}
              >
                <option value="brief">Brief — short, focused replies</option>
                <option value="balanced">Balanced — moderate detail (default)</option>
                <option value="detailed">Detailed — thorough, full explanations</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="submit" disabled={configSaving || !name.trim()} style={btnPrimary}>
              {configSaving ? "Saving…" : "Save config"}
            </button>
            {configSaved && <span style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>Saved ✓</span>}
            {configErr   && <span style={{ fontSize: 12, color: "#dc2626" }}>{configErr}</span>}
          </div>
        </form>

        {/* ── Section 2: Tool allowlist ─────────────────────────────────────── */}
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
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={isWild}
                        onChange={(e) => toggleWildcard(p.provider_id, e.target.checked)} />
                      <span style={{ fontWeight: 600, fontSize: 13, color: P.fg }}>
                        Allow all {p.label} actions
                      </span>
                    </label>

                    {!isWild && (
                      <div style={{ paddingLeft: 22, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                        {p.actions.map((a) => {
                          const key     = `${p.provider_id}:${a.id}`;
                          const checked = specific.has(key);
                          return (
                            <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                              <input type="checkbox" checked={checked}
                                onChange={(e) => toggleAction(key, e.target.checked)} />
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
            {toolsSaved && <span style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>Tools saved ✓</span>}
            {toolsErr   && <span style={{ fontSize: 12, color: "#dc2626" }}>{toolsErr}</span>}
          </div>
        </form>

      </div>
    </div>
  );
}
