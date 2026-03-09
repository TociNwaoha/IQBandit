"use client";

/**
 * app/agents/policy/PolicyClient.tsx
 * Department policy editor.
 *
 * Features:
 *   - Department tabs (one per dept)
 *   - Per-setting toggles: allow_web, allow_files, ask_before_tools,
 *     ask_before_web, ask_before_files, response_style
 *   - "Applies to N agents" badge
 *   - Save + Reset buttons with confirmation modal for Reset
 */

import { useState } from "react";
import Link from "next/link";
import type { Department } from "@/lib/departments";
import type { DepartmentPolicy } from "@/lib/departmentPolicies";

/* ─── Palette ─────────────────────────────────────────────────────────────── */

const P = {
  bg:      "#080812",
  surface: "#10102A",
  card:    "#14143A",
  border:  "#1E1E44",
  fg:      "#E2E2FF",
  sub:     "#6868A0",
  dim:     "#2A2A50",
  muted:   "#0D0D20",
};

/* ─── Types ───────────────────────────────────────────────────────────────── */

type ResponseStyle = "brief" | "balanced" | "detailed";

interface DeptPolicyRow {
  dept:       Department;
  policy:     DepartmentPolicy | null;
  agentCount: number;
}

interface Props {
  deptPolicies: DeptPolicyRow[];
}

/* ─── Reset confirmation modal ────────────────────────────────────────────── */

function ResetModal({ deptLabel, onConfirm, onCancel, loading }: {
  deptLabel: string;
  onConfirm: () => void;
  onCancel:  () => void;
  loading:   boolean;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} role="dialog" aria-modal="true" aria-label="Reset policy confirmation">
      <div style={{
        background: P.surface, border: "1px solid #FF6B6B44", padding: "28px 32px",
        maxWidth: 380, width: "90%",
      }}>
        <div style={{
          fontFamily: "var(--font-pixel, monospace)", fontSize: 8, color: "#FF6B6B",
          letterSpacing: "0.1em", marginBottom: 12,
        }}>RESET POLICY?</div>
        <div style={{
          fontFamily: "monospace", fontSize: 12, color: P.sub, lineHeight: 1.6, marginBottom: 20,
        }}>
          Reset <strong style={{ color: P.fg }}>{deptLabel}</strong> to locked defaults:
          web ✓, files ✓, consent on, style balanced. This cannot be undone.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
              color: "#080812", background: loading ? P.sub : "#FF6B6B",
              border: "none", padding: "8px 14px", cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: "0.1em",
            }}
          >{loading ? "..." : "RESET"}</button>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
              color: P.sub, background: "transparent", border: `1px solid ${P.border}`,
              padding: "8px 14px", cursor: "pointer", letterSpacing: "0.1em",
            }}
          >CANCEL</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Toggle row ──────────────────────────────────────────────────────────── */

function ToggleRow({ label, description, checked, onChange, color }: {
  label:       string;
  description: string;
  checked:     boolean;
  onChange:    (v: boolean) => void;
  color:       string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "10px 0", borderBottom: `1px solid ${P.dim}`,
    }}>
      {/* Toggle */}
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0, marginTop: 2,
          width: 34, height: 18, position: "relative",
          background: checked ? color : P.dim,
          border: `1px solid ${checked ? color : P.border}`,
          cursor: "pointer", transition: "background 0.15s",
        }}
      >
        <span style={{
          position: "absolute", top: 2,
          left: checked ? 16 : 2,
          width: 12, height: 12,
          background: checked ? "#080812" : P.sub,
          transition: "left 0.15s",
          display: "block",
        }} />
      </button>
      {/* Text */}
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: "var(--font-pixel, monospace)", fontSize: 6, color: checked ? P.fg : P.sub,
          letterSpacing: "0.08em", marginBottom: 3,
        }}>{label}</div>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: P.dim, lineHeight: 1.5 }}>
          {description}
        </div>
      </div>
      {/* Badge */}
      <span style={{
        flexShrink: 0,
        fontFamily: "var(--font-pixel, monospace)", fontSize: 5,
        color: checked ? color : "#FF6B6B",
        border: `1px solid ${checked ? color + "66" : "#FF6B6B66"}`,
        background: checked ? color + "0D" : "#FF6B6B0D",
        padding: "2px 6px", letterSpacing: "0.08em",
        marginTop: 2,
      }}>{checked ? "ON" : "OFF"}</span>
    </div>
  );
}

/* ─── Style selector ──────────────────────────────────────────────────────── */

function StyleSelector({ value, onChange, color }: {
  value:    ResponseStyle;
  onChange: (v: ResponseStyle) => void;
  color:    string;
}) {
  const options: { value: ResponseStyle; label: string; desc: string }[] = [
    { value: "brief",    label: "BRIEF",    desc: "Short answers, bullet points" },
    { value: "balanced", label: "BALANCED", desc: "Standard detail level" },
    { value: "detailed", label: "DETAILED", desc: "Full explanations & examples" },
  ];
  return (
    <div>
      <div style={{
        fontFamily: "var(--font-pixel, monospace)", fontSize: 5, color: P.sub,
        letterSpacing: "0.2em", marginBottom: 8,
      }}>RESPONSE STYLE</div>
      <div style={{ display: "flex", gap: 6 }}>
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            title={opt.desc}
            style={{
              flex: 1, padding: "8px 6px",
              fontFamily: "var(--font-pixel, monospace)", fontSize: 5, letterSpacing: "0.08em",
              color: value === opt.value ? "#080812" : P.sub,
              background: value === opt.value ? color : "transparent",
              border: `1px solid ${value === opt.value ? color : P.border}`,
              cursor: "pointer",
            }}
          >{opt.label}</button>
        ))}
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 10, color: P.dim, marginTop: 5 }}>
        {options.find((o) => o.value === value)?.desc}
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */

export default function PolicyClient({ deptPolicies }: Props) {
  const [activeDeptId, setActiveDeptId] = useState(deptPolicies[0]?.dept.id ?? "");

  // Per-department local policy state (keyed by dept.id)
  const [localPolicies, setLocalPolicies] = useState<Record<string, DepartmentPolicy>>(() => {
    const map: Record<string, DepartmentPolicy> = {};
    for (const row of deptPolicies) {
      if (row.policy) map[row.dept.id] = row.policy;
    }
    return map;
  });

  const [saving,   setSaving]   = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saved,    setSaved]    = useState<string | null>(null); // dept id that just saved
  const [error,    setError]    = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);

  const activeRow    = deptPolicies.find((r) => r.dept.id === activeDeptId);
  const activePolicy = localPolicies[activeDeptId];
  const activeDept   = activeRow?.dept;

  function setPolicyField<K extends keyof Omit<DepartmentPolicy, "department_id" | "updated_at">>(
    field: K,
    value: DepartmentPolicy[K],
  ) {
    setLocalPolicies((prev) => ({
      ...prev,
      [activeDeptId]: { ...prev[activeDeptId], [field]: value },
    }));
    setSaved(null);
  }

  async function handleSave() {
    if (!activePolicy || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/department-policies?departmentId=${encodeURIComponent(activeDeptId)}`,
        {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            allow_web:        activePolicy.allow_web,
            allow_files:      activePolicy.allow_files,
            ask_before_tools: activePolicy.ask_before_tools,
            ask_before_web:   activePolicy.ask_before_web,
            ask_before_files: activePolicy.ask_before_files,
            response_style:   activePolicy.response_style,
          }),
        },
      );
      const data = await res.json() as { policy?: DepartmentPolicy; error?: string };
      if (!res.ok) { setError(data.error ?? `Error ${res.status}`); return; }
      if (data.policy) {
        setLocalPolicies((prev) => ({ ...prev, [activeDeptId]: data.policy! }));
        setSaved(activeDeptId);
        setTimeout(() => setSaved(null), 2500);
      }
    } catch {
      setError("Network error — could not save policy.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/department-policies?departmentId=${encodeURIComponent(activeDeptId)}`,
        { method: "POST" },
      );
      const data = await res.json() as { policy?: DepartmentPolicy; error?: string };
      if (!res.ok) { setError(data.error ?? `Error ${res.status}`); return; }
      if (data.policy) {
        setLocalPolicies((prev) => ({ ...prev, [activeDeptId]: data.policy! }));
        setSaved(activeDeptId);
        setTimeout(() => setSaved(null), 2500);
      }
    } catch {
      setError("Network error — could not reset policy.");
    } finally {
      setResetting(false);
      setShowReset(false);
    }
  }

  return (
    <>
      {showReset && activeDept && (
        <ResetModal
          deptLabel={activeDept.label}
          onConfirm={handleReset}
          onCancel={() => setShowReset(false)}
          loading={resetting}
        />
      )}

      <div style={{
        minHeight: "100vh", background: P.bg, color: P.fg,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}>

        {/* Header bar */}
        <header style={{
          borderBottom: `1px solid ${P.border}`, padding: "12px 24px",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <Link href="/agents" style={{
            fontFamily: "var(--font-pixel, monospace)", fontSize: 7, color: P.sub,
            textDecoration: "none", border: `1px solid ${P.border}`,
            padding: "5px 9px", letterSpacing: "0.12em",
          }}>← AGENTS</Link>
          <div style={{
            fontFamily: "var(--font-pixel, monospace)", fontSize: 8, color: P.fg,
            letterSpacing: "0.1em",
          }}>DEPARTMENT POLICIES</div>
          <div style={{
            fontFamily: "monospace", fontSize: 11, color: P.sub, marginLeft: 4,
          }}>Default tool permissions for each department</div>
        </header>

        <div style={{ display: "flex", minHeight: "calc(100vh - 52px)" }}>

          {/* Dept tab list */}
          <nav aria-label="Department tabs" style={{
            width: 200, flexShrink: 0, borderRight: `1px solid ${P.border}`,
            background: P.surface, padding: "16px 0",
          }}>
            {deptPolicies.map(({ dept, agentCount }) => {
              const isActive = dept.id === activeDeptId;
              return (
                <button
                  key={dept.id}
                  onClick={() => { setActiveDeptId(dept.id); setError(null); setSaved(null); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "10px 16px",
                    background: isActive ? P.card : "transparent",
                    borderLeft: isActive ? `3px solid ${dept.color}` : "3px solid transparent",
                    border: "none", borderBottom: `1px solid ${P.dim}`,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14 }} aria-hidden="true">{dept.emoji}</span>
                    <div>
                      <div style={{
                        fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
                        color: isActive ? dept.color : P.fg, letterSpacing: "0.06em",
                      }}>{dept.label.toUpperCase()}</div>
                      <div style={{ fontFamily: "monospace", fontSize: 10, color: P.dim, marginTop: 2 }}>
                        {agentCount} agent{agentCount !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Policy editor panel */}
          <main style={{ flex: 1, overflowY: "auto", padding: "24px 32px", maxWidth: 640 }}>
            {!activeDept || !activePolicy ? (
              <div style={{
                fontFamily: "var(--font-pixel, monospace)", fontSize: 7, color: P.sub,
                letterSpacing: "0.1em", marginTop: 40,
              }}>SELECT A DEPARTMENT</div>
            ) : (
              <>
                {/* Dept header */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                  <div style={{
                    width: 40, height: 40, background: activeDept.color, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, border: `2px solid ${activeDept.dark}`,
                  }} aria-hidden="true">{activeDept.emoji}</div>
                  <div>
                    <div style={{
                      fontFamily: "var(--font-pixel, monospace)", fontSize: 8,
                      color: activeDept.color, letterSpacing: "0.08em",
                      textShadow: `0 0 10px ${activeDept.glow}`,
                    }}>{activeDept.label.toUpperCase()}</div>
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: P.sub, marginTop: 2 }}>
                      {activeRow?.agentCount ?? 0} agent{(activeRow?.agentCount ?? 0) !== 1 ? "s" : ""} inherit this policy
                    </div>
                  </div>
                </div>

                {/* Tool access section */}
                <div style={{
                  background: P.surface, border: `1px solid ${P.border}`,
                  padding: "16px 18px", marginBottom: 16,
                }}>
                  <div style={{
                    fontFamily: "var(--font-pixel, monospace)", fontSize: 5, color: P.sub,
                    letterSpacing: "0.2em", marginBottom: 12,
                  }}>TOOL ACCESS</div>

                  <ToggleRow
                    label="ALLOW WEB"
                    description="Agents may use web search / browsing tools."
                    checked={activePolicy.allow_web}
                    onChange={(v) => setPolicyField("allow_web", v)}
                    color={activeDept.color}
                  />
                  <ToggleRow
                    label="ALLOW FILES"
                    description="Agents may use file read / search tools."
                    checked={activePolicy.allow_files}
                    onChange={(v) => setPolicyField("allow_files", v)}
                    color={activeDept.color}
                  />
                </div>

                {/* Consent section */}
                <div style={{
                  background: P.surface, border: `1px solid ${P.border}`,
                  padding: "16px 18px", marginBottom: 16,
                }}>
                  <div style={{
                    fontFamily: "var(--font-pixel, monospace)", fontSize: 5, color: P.sub,
                    letterSpacing: "0.2em", marginBottom: 12,
                  }}>CONSENT GATES</div>

                  <ToggleRow
                    label="ASK BEFORE ANY TOOL"
                    description="Enable the consent gate system for this department."
                    checked={activePolicy.ask_before_tools}
                    onChange={(v) => setPolicyField("ask_before_tools", v)}
                    color={activeDept.color}
                  />
                  <ToggleRow
                    label="ASK BEFORE WEB"
                    description="Show consent modal before each web search. (Requires ask-before-tools.)"
                    checked={activePolicy.ask_before_web}
                    onChange={(v) => setPolicyField("ask_before_web", v)}
                    color={activeDept.color}
                  />
                  <div style={{ borderBottom: "none" }}>
                    <ToggleRow
                      label="ASK BEFORE FILES"
                      description="Show consent modal before each file search. (Requires ask-before-tools.)"
                      checked={activePolicy.ask_before_files}
                      onChange={(v) => setPolicyField("ask_before_files", v)}
                      color={activeDept.color}
                    />
                  </div>
                </div>

                {/* Response style section */}
                <div style={{
                  background: P.surface, border: `1px solid ${P.border}`,
                  padding: "16px 18px", marginBottom: 24,
                }}>
                  <StyleSelector
                    value={activePolicy.response_style as ResponseStyle}
                    onChange={(v) => setPolicyField("response_style", v)}
                    color={activeDept.color}
                  />
                </div>

                {/* Error */}
                {error && (
                  <div style={{
                    fontFamily: "var(--font-pixel, monospace)", fontSize: 6, color: "#FF6B6B",
                    border: "1px solid #FF6B6B44", padding: "8px 12px", marginBottom: 16,
                    letterSpacing: "0.08em",
                  }}>✖ {error.toUpperCase()}</div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      fontFamily: "var(--font-pixel, monospace)", fontSize: 7, letterSpacing: "0.1em",
                      color: "#080812",
                      background: saving ? P.sub : activeDept.color,
                      border: "none", padding: "10px 20px",
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                  >{saving ? "SAVING..." : "SAVE POLICY"}</button>

                  <button
                    onClick={() => setShowReset(true)}
                    disabled={resetting || saving}
                    style={{
                      fontFamily: "var(--font-pixel, monospace)", fontSize: 6, letterSpacing: "0.1em",
                      color: "#FF6B6B88",
                      background: "transparent",
                      border: "1px solid #FF6B6B33", padding: "10px 14px",
                      cursor: (resetting || saving) ? "not-allowed" : "pointer",
                    }}
                  >RESET TO DEFAULTS</button>

                  {saved === activeDeptId && (
                    <span style={{
                      fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
                      color: "#55EFC4", letterSpacing: "0.1em",
                    }}>SAVED ✓</span>
                  )}
                </div>

                {/* Updated-at note */}
                {activePolicy.updated_at && (
                  <div style={{
                    fontFamily: "monospace", fontSize: 10, color: P.dim, marginTop: 16,
                  }}>
                    Last updated: {new Date(activePolicy.updated_at).toLocaleString()}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
