"use client";

/**
 * app/agents/[department]/[agentId]/AgentChatClient.tsx
 * Full-screen pixel art agent chat interface — v5.
 *
 * v5 additions on top of v4:
 *   A) Thread titles — auto-updated after first message; inline rename in filing cabinet
 *   B) Agent capability settings enforced in system prompt (allowWeb, allowFiles, askBeforeTools, responseStyle)
 *   C) Export (.md download) + Clear (confirm modal → wipe messages)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter }  from "next/navigation";
import Link           from "next/link";
import type { Agent }      from "@/lib/agents";
import type { Department } from "@/lib/departments";
import type { ConversationMessage } from "@/lib/conversations";
import type { EffectiveAgentSettings } from "@/lib/departmentPolicies";

/* ─── Debug flag ─────────────────────────────────────────────────────────────*/
const SHOW_DEBUG =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_DEBUG_OVERLAY === "true";

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

interface ChatMsg { role: "user" | "assistant"; content: string; ts?: string; }

interface ConvSummary { id: string; title: string; updated_at: string; }

interface PresenceData {
  presenceStatus:    "live" | "stale" | "offline";
  is_working:        boolean;
  activity:          string;
  detail:            string;
  note:              string;
  last_heartbeat_at: string;
}

type ConsentTool         = "web" | "files" | "gmail";
type ToolConsentDecision = "allow_once" | "always_allow" | "deny";

interface ToolIntent {
  tool:    ConsentTool;
  reason:  string;
  query:   string | null;
  action?: "search" | "read"; // Gmail-specific
}

/** A tool-consent audit event shown as an inline card in the chat timeline. */
interface AuditEvent {
  id:          string;
  tool:        ConsentTool;
  decision:    ToolConsentDecision;
  reason:      string;
  query:       string | null;
  created_at:  string;
  /** If present, enables the "Run with tool now" replay button. */
  replayContext?: {
    chatHistory:   ChatMsg[];
    userMessageId: string;
    wasFirst:      boolean;
  };
}

type TimelineItem =
  | { kind: "msg";   msg: ChatMsg;    ts: string }
  | { kind: "event"; ev:  AuditEvent; ts: string };

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins   = Math.floor(diffMs / 60_000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function heartbeatAgeLabel(isoTs: string): string {
  const age = Math.floor((Date.now() - new Date(isoTs).getTime()) / 1000);
  if (age < 2)  return "< 1s ago";
  if (age < 60) return `${age}s ago`;
  return `${Math.floor(age / 60)}m ago`;
}

function genId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function deptCapabilities(deptLabel: string): string[] {
  const l = deptLabel.toLowerCase();
  if (l.includes("research"))                       return ["Web", "Files", "Search"];
  if (l.includes("market"))                         return ["Web", "Notion", "Gmail", "Files"];
  if (l.includes("sales"))                          return ["Gmail", "Notion", "Web"];
  if (l.includes("ops") || l.includes("oper"))     return ["Files", "Notion", "Web"];
  if (l.includes("engineer") || l.includes("dev")) return ["Files", "Web", "Search"];
  return ["Web", "Files"];
}

/** Build extra system-prompt instructions from EFFECTIVE capability settings. */
function buildCapabilityInstructions(eff: Pick<EffectiveAgentSettings, "allow_web" | "allow_files" | "ask_before_tools" | "response_style">): string {
  const parts: string[] = [];
  if (!eff.allow_web)        parts.push("Do not browse the web or search the internet.");
  if (!eff.allow_files)      parts.push("Do not use file search or read from files.");
  if (eff.ask_before_tools)  parts.push("Always ask for user confirmation before using any tool.");
  if (eff.response_style === "brief") {
    parts.push("Keep responses concise and to the point. Prefer short bullet lists over long paragraphs.");
  } else if (eff.response_style === "detailed") {
    parts.push("Provide thorough, detailed responses with full explanations and examples.");
  }
  return parts.length ? "\n\n" + parts.join(" ") : "";
}

/* ─── Message bubbles ─────────────────────────────────────────────────────── */

function UserBubble({ content }: { content: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
      <div style={{
        maxWidth: "72%", background: "#2A2A5A", border: "1px solid #3A3A72",
        padding: "10px 14px", fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 13, lineHeight: 1.55, color: P.fg, whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>{content}</div>
    </div>
  );
}

function AssistantBubble({ content, emoji, color }: { content: string; emoji: string; color: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
      <div style={{
        flexShrink: 0, width: 32, height: 32, background: color, display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: 16,
        imageRendering: "pixelated", border: `1px solid ${color}`,
      }} aria-hidden="true">{emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          background: P.card, border: `1px solid ${P.border}`, padding: "10px 14px",
          fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 13,
          lineHeight: 1.6, color: P.fg, whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>{content}</div>
        <button onClick={copy} aria-label="Copy message" style={{
          marginTop: 4, fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
          color: copied ? "rgba(85,239,196,0.8)" : P.sub, background: "transparent",
          border: "none", cursor: "pointer", letterSpacing: "0.12em", padding: "2px 4px",
        }}>{copied ? "COPIED ✓" : "COPY"}</button>
      </div>
    </div>
  );
}

function TypingDots({ color, emoji }: { color: string; emoji: string }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
      <div style={{
        flexShrink: 0, width: 32, height: 32, background: color, display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: 16, border: `1px solid ${color}`,
      }} aria-hidden="true">{emoji}</div>
      <div style={{
        background: P.card, border: `1px solid ${P.border}`, padding: "12px 16px",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} aria-hidden="true" style={{
            width: 6, height: 6, background: color,
            animation: `typing-dot 1.2s ${i * 0.2}s ease-in-out infinite`,
          }} />
        ))}
        <span style={{
          fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
          color: P.sub, marginLeft: 6, letterSpacing: "0.15em",
        }}>THINKING...</span>
      </div>
    </div>
  );
}

/* ─── Clear confirmation modal ────────────────────────────────────────────── */

function ClearModal({ onConfirm, onCancel, clearing }: {
  onConfirm: () => void; onCancel: () => void; clearing: boolean;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} role="dialog" aria-modal="true" aria-label="Clear thread confirmation">
      <div style={{
        background: P.surface, border: `1px solid #FF6B6B44`, padding: "28px 32px",
        maxWidth: 340, width: "90%",
      }}>
        <div style={{
          fontFamily: "var(--font-pixel, monospace)", fontSize: 8, color: "#FF6B6B",
          letterSpacing: "0.1em", marginBottom: 12,
        }}>CLEAR THREAD?</div>
        <div style={{
          fontFamily: "monospace", fontSize: 12, color: P.sub, lineHeight: 1.6, marginBottom: 20,
        }}>
          All messages in this thread will be deleted. The conversation slot will remain.
          This cannot be undone.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onConfirm}
            disabled={clearing}
            style={{
              fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
              color: "#080812", background: clearing ? P.sub : "#FF6B6B",
              border: "none", padding: "8px 14px", cursor: clearing ? "not-allowed" : "pointer",
              letterSpacing: "0.1em",
            }}
          >{clearing ? "..." : "CLEAR"}</button>
          <button
            onClick={onCancel}
            disabled={clearing}
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

/* ─── Tool Consent Modal ──────────────────────────────────────────────────── */

function ToolConsentModal({
  intent, dept, onAllowOnce, onAlwaysAllow, onDeny, loading,
}: {
  intent:        ToolIntent;
  dept:          { color: string; dark: string };
  onAllowOnce:   () => void;
  onAlwaysAllow: () => void;
  onDeny:        () => void;
  loading:       boolean;
}) {
  const toolLabel = intent.tool === "web" ? "WEB SEARCH" : intent.tool === "gmail" ? "GMAIL" : "FILE SEARCH";

  // Esc → Deny
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onDeny();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tool permission required"
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        background: P.surface, border: `2px solid ${dept.color}44`,
        padding: "28px 28px 24px",
        maxWidth: 380, width: "90%",
        boxShadow: `0 0 40px ${dept.color}22`,
      }}>
        {/* Title */}
        <div style={{
          fontFamily: "var(--font-pixel, monospace)", fontSize: 8, color: dept.color,
          letterSpacing: "0.12em", marginBottom: 14,
        }}>🔒 PERMISSION NEEDED</div>

        {/* Tool label */}
        <div style={{
          fontFamily: "var(--font-pixel, monospace)", fontSize: 7, color: P.fg,
          letterSpacing: "0.08em", marginBottom: 10,
        }}>This agent wants to use <span style={{ color: dept.color }}>{toolLabel}</span></div>

        {/* Reason */}
        <div style={{
          fontFamily: "monospace", fontSize: 12, color: P.sub, lineHeight: 1.6, marginBottom: 10,
        }}>{intent.reason}</div>

        {/* Query preview */}
        {intent.query && (
          <div style={{
            fontFamily: "monospace", fontSize: 11, color: P.sub,
            background: P.muted, border: `1px solid ${P.border}`,
            padding: "6px 10px", marginBottom: 16,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            <span style={{ color: P.dim, letterSpacing: "0.1em", fontFamily: "var(--font-pixel, monospace)", fontSize: 5 }}>QUERY · </span>
            {intent.query}
          </div>
        )}

        {!intent.query && <div style={{ marginBottom: 16 }} />}

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Allow once */}
          <button
            onClick={onAllowOnce}
            disabled={loading}
            style={{
              fontFamily: "var(--font-pixel, monospace)", fontSize: 6, letterSpacing: "0.1em",
              color: P.bg, background: loading ? P.sub : dept.color,
              border: "none", padding: "9px 14px", cursor: loading ? "not-allowed" : "pointer",
            }}
          >{loading ? "..." : "ALLOW ONCE"}</button>

          {/* Always allow */}
          <button
            onClick={onAlwaysAllow}
            disabled={loading}
            style={{
              fontFamily: "var(--font-pixel, monospace)", fontSize: 6, letterSpacing: "0.1em",
              color: dept.color, background: "transparent",
              border: `1px solid ${dept.color}66`, padding: "9px 14px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >ALWAYS ALLOW</button>

          {/* Deny */}
          <button
            onClick={onDeny}
            disabled={loading}
            style={{
              fontFamily: "var(--font-pixel, monospace)", fontSize: 6, letterSpacing: "0.1em",
              color: P.sub, background: "transparent",
              border: `1px solid ${P.border}`, padding: "9px 14px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >DENY</button>
        </div>

        <div style={{
          fontFamily: "monospace", fontSize: 10, color: P.dim, marginTop: 12,
        }}>Press Esc to deny</div>
      </div>
    </div>
  );
}

/* ─── Filing Cabinet Panel ────────────────────────────────────────────────── */

function FilingCabinetPanel({
  conversations, conversationId, histLoading, creating,
  onSwitch, onNew, onClose, dept, cabinetRef, onRename,
}: {
  conversations:  ConvSummary[];
  conversationId: string;
  histLoading:    boolean;
  creating:       boolean;
  dept:           Department;
  cabinetRef:     React.RefObject<HTMLDivElement | null>;
  onSwitch:  (id: string) => void;
  onNew:     () => void;
  onClose:   () => void;
  onRename:  (id: string, newTitle: string) => Promise<void>;
}) {
  const shown = conversations.slice(0, 5);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editValue,  setEditValue]  = useState("");
  const [renaming,   setRenaming]   = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  function startEdit(conv: ConvSummary) {
    setEditingId(conv.id);
    setEditValue(conv.title || "New Chat");
    setTimeout(() => editInputRef.current?.focus(), 30);
  }

  async function commitEdit() {
    if (!editingId || !editValue.trim() || renaming) return;
    setRenaming(true);
    await onRename(editingId, editValue.trim());
    setRenaming(false);
    setEditingId(null);
  }

  function handleEditKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter")  { e.preventDefault(); void commitEdit(); }
    if (e.key === "Escape") { setEditingId(null); }
  }

  return (
    <div ref={cabinetRef} role="dialog" aria-label="Conversation threads" style={{
      position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
      background: P.surface, border: `1px solid ${dept.color}44`,
      minWidth: 290, maxWidth: 360,
      boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${dept.color}22`,
    }}>
      {/* Cabinet header */}
      <div style={{
        background: `linear-gradient(90deg, ${dept.color}18, transparent)`,
        borderBottom: `1px solid ${P.border}`, padding: "8px 12px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{
          fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
          color: dept.color, letterSpacing: "0.15em",
        }}>🗂 THREADS</div>
        <button onClick={onNew} disabled={creating} aria-label="New conversation" style={{
          fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
          color: creating ? P.sub : P.bg, background: creating ? P.dim : dept.color,
          border: "none", padding: "4px 8px", cursor: creating ? "not-allowed" : "pointer",
          letterSpacing: "0.1em",
        }}>{creating ? "..." : "+ FOLDER"}</button>
      </div>

      {/* Drawer entries */}
      {shown.length === 0 ? (
        <div style={{
          fontFamily: "var(--font-pixel, monospace)", fontSize: 7,
          color: P.dim, padding: "16px", letterSpacing: "0.1em",
        }}>NO THREADS YET</div>
      ) : (
        <div role="listbox" aria-label="Conversation threads">
          {shown.map((c, idx) => {
            const isActive  = c.id === conversationId;
            const isEditing = editingId === c.id;
            return (
              <div key={c.id} style={{
                display: "flex", alignItems: "flex-start",
                background: isActive ? P.card : "transparent",
                borderBottom: `1px solid ${P.border}`,
                borderLeft: isActive ? `3px solid ${dept.color}` : "3px solid transparent",
              }}>
                {/* Main clickable area */}
                <button
                  role="option"
                  aria-selected={isActive}
                  onClick={() => { if (!isEditing) { onSwitch(c.id); onClose(); } }}
                  disabled={histLoading || isEditing}
                  style={{
                    flex: 1, textAlign: "left", padding: "10px 10px 10px 10px",
                    background: "transparent", border: "none",
                    cursor: (histLoading || isEditing) ? "default" : "pointer",
                    display: "flex", gap: 8, alignItems: "flex-start",
                  }}
                >
                  <div style={{
                    flexShrink: 0, fontFamily: "var(--font-pixel, monospace)", fontSize: 5,
                    color: isActive ? dept.color : P.sub, marginTop: 2,
                    letterSpacing: "0.1em", minWidth: 14,
                  }}>{String(idx + 1).padStart(2, "0")}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleEditKey}
                        onBlur={() => void commitEdit()}
                        disabled={renaming}
                        maxLength={80}
                        style={{
                          width: "100%", fontFamily: "var(--font-pixel, monospace)", fontSize: 7,
                          color: dept.color, background: P.bg, border: `1px solid ${dept.color}`,
                          padding: "2px 4px", outline: "none", boxSizing: "border-box",
                        }}
                      />
                    ) : (
                      <div style={{
                        fontFamily: "var(--font-pixel, monospace)", fontSize: 7,
                        color: isActive ? dept.color : P.fg, letterSpacing: "0.04em",
                        overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                        marginBottom: 3,
                      }}>{c.title || "New Chat"}</div>
                    )}
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: P.sub }}>
                      {timeAgo(c.updated_at)}
                    </div>
                  </div>
                  {isActive && !isEditing && (
                    <div style={{
                      flexShrink: 0, fontFamily: "var(--font-pixel, monospace)", fontSize: 5,
                      color: dept.color, letterSpacing: "0.1em", marginTop: 2,
                    }}>OPEN</div>
                  )}
                </button>

                {/* Rename button — only on active thread */}
                {isActive && !isEditing && (
                  <button
                    onClick={() => startEdit(c)}
                    aria-label={`Rename thread: ${c.title}`}
                    title="Rename"
                    style={{
                      flexShrink: 0, padding: "10px 8px", background: "transparent",
                      border: "none", cursor: "pointer",
                      fontFamily: "var(--font-pixel, monospace)", fontSize: 8,
                      color: P.sub,
                    }}
                  >✏</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dismiss */}
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${P.border}` }}>
        <button onClick={onClose} style={{
          fontFamily: "var(--font-pixel, monospace)", fontSize: 5, color: P.sub,
          background: "transparent", border: "none", cursor: "pointer",
          letterSpacing: "0.1em", padding: 0,
        }}>ESC TO CLOSE</button>
      </div>
    </div>
  );
}

/* ─── Event Card (inline consent timeline) ────────────────────────────────── */

const DECISION_COLORS: Record<ToolConsentDecision, string> = {
  allow_once:   "#55EFC4",
  always_allow: "#55EFC4",
  deny:         "#FF6B6B",
};

const DECISION_LABELS: Record<ToolConsentDecision, string> = {
  allow_once:   "ALLOWED ONCE",
  always_allow: "ALWAYS ALLOWED",
  deny:         "DENIED",
};

function EventCard({
  ev, dept, onReplay, replaying,
}: {
  ev:        AuditEvent;
  dept:      { color: string; dark: string };
  onReplay?: () => void;
  replaying?: boolean;
}) {
  const toolLabel     = ev.tool === "web" ? "WEB SEARCH" : ev.tool === "gmail" ? "GMAIL" : "FILE SEARCH";
  const decisionColor = DECISION_COLORS[ev.decision];
  const decisionLabel = DECISION_LABELS[ev.decision];

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12,
      opacity: 0.85,
    }}>
      {/* Left accent */}
      <div style={{
        flexShrink: 0, width: 3, alignSelf: "stretch",
        background: `linear-gradient(180deg, ${decisionColor}88, transparent)`,
        minHeight: 40,
      }} aria-hidden="true" />

      <div style={{
        flex: 1, background: P.surface, border: `1px solid ${decisionColor}22`,
        padding: "10px 14px",
      }}>
        {/* Header row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap",
        }}>
          <span style={{
            fontFamily: "var(--font-pixel, monospace)", fontSize: 5, color: decisionColor,
            letterSpacing: "0.12em",
          }}>🔒 TOOL REQUEST</span>
          <span style={{
            fontFamily: "var(--font-pixel, monospace)", fontSize: 5, color: dept.color,
            border: `1px solid ${dept.color}44`, padding: "2px 6px", letterSpacing: "0.08em",
          }}>{toolLabel}</span>
          <span style={{
            fontFamily: "var(--font-pixel, monospace)", fontSize: 5,
            color: ev.decision === "deny" ? "#FF6B6B" : "#55EFC4",
            border: `1px solid ${decisionColor}44`, padding: "2px 6px", letterSpacing: "0.08em",
          }}>{decisionLabel}</span>
        </div>

        {/* Reason */}
        <div style={{
          fontFamily: "monospace", fontSize: 11, color: P.sub, lineHeight: 1.5, marginBottom: 4,
        }}>{ev.reason}</div>

        {/* Query */}
        {ev.query && (
          <div style={{
            fontFamily: "monospace", fontSize: 10, color: P.dim,
            background: P.muted, padding: "3px 8px", marginBottom: 4,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            <span style={{
              fontFamily: "var(--font-pixel, monospace)", fontSize: 4,
              letterSpacing: "0.1em", marginRight: 4,
            }}>QUERY</span>
            {ev.query}
          </div>
        )}

        {/* Footer: timestamp + replay */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <span style={{
            fontFamily: "monospace", fontSize: 10, color: P.dim,
          }}>{timeAgo(ev.created_at)}</span>

          {ev.decision === "deny" && onReplay && (
            <button
              onClick={onReplay}
              disabled={replaying}
              style={{
                fontFamily: "var(--font-pixel, monospace)", fontSize: 5, letterSpacing: "0.1em",
                color: replaying ? P.sub : dept.color,
                background: "transparent", border: `1px solid ${dept.color}66`,
                padding: "3px 8px", cursor: replaying ? "not-allowed" : "pointer",
              }}
            >{replaying ? "..." : `▶ RUN WITH ${toolLabel}`}</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Agent Brain Sidebar ─────────────────────────────────────────────────── */

const PRESENCE_COLOR: Record<"live" | "stale" | "offline", string> = {
  live:    "rgba(85,239,196,1)",
  stale:   "#F0C060",
  offline: "#6868A0",
};

const QUICK_ACTIONS = [
  { label: "Summarize so far",  text: "Please summarize our conversation so far in bullet points." },
  { label: "Make action plan",  text: "Based on what we've discussed, draft a concise action plan with clear next steps." },
  { label: "Draft reply",       text: "Draft a professional reply I can send based on the context above." },
];

function AgentBrainSidebar({ agent, dept, presence, effective, gmailConnected, onQuickAction, onClose }: {
  agent:          Agent;
  dept:           Department;
  presence:       PresenceData | null;
  effective:      EffectiveAgentSettings;
  gmailConnected: boolean;
  onQuickAction:  (text: string) => void;
  onClose?:       () => void;
}) {
  const caps   = deptCapabilities(dept.label);
  const status = presence?.presenceStatus ?? "offline";
  const statusColor = PRESENCE_COLOR[status];

  function activityLabel(): string {
    if (!presence) return "—";
    const { activity, detail, note } = presence;
    if (activity === "responding") return "Responding…";
    if (activity === "tooling")    return detail ? `Tooling: ${detail}` : "Running tool…";
    return note || "Idle";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {onClose && (
        <button onClick={onClose} aria-label="Close sidebar" className="sidebar-close-btn" style={{
          display: "none", alignSelf: "flex-end", margin: "10px 10px 0",
          fontFamily: "var(--font-pixel, monospace)", fontSize: 6, color: P.sub,
          background: "transparent", border: `1px solid ${P.border}`,
          padding: "4px 8px", cursor: "pointer", letterSpacing: "0.1em",
        }}>✕ CLOSE</button>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Agent header */}
        <div style={{
          display: "flex", gap: 10, alignItems: "center",
          paddingBottom: 14, borderBottom: `1px solid ${P.border}`,
        }}>
          <div style={{
            flexShrink: 0, width: 36, height: 36, background: dept.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, imageRendering: "pixelated", border: `2px solid ${dept.dark}`,
          }} aria-hidden="true">{dept.emoji}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: "var(--font-pixel, monospace)", fontSize: 7, color: dept.color,
              letterSpacing: "0.06em", overflow: "hidden", whiteSpace: "nowrap",
              textOverflow: "ellipsis", textShadow: `0 0 8px ${dept.glow}`, lineHeight: 1.5,
            }}>{agent.name}</div>
            <div style={{
              fontFamily: "monospace", fontSize: 10, color: P.sub, marginTop: 2,
              overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
            }}>{dept.label} Dept.</div>
          </div>
        </div>

        {/* Presence */}
        <div>
          <div style={{
            fontFamily: "var(--font-pixel, monospace)", fontSize: 5, color: P.sub,
            letterSpacing: "0.2em", marginBottom: 8,
          }}>PRESENCE</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span aria-hidden="true" style={{
              display: "inline-block", width: 7, height: 7, background: statusColor,
              imageRendering: "pixelated",
              animation: status === "live" ? "status-pulse 1.1s ease-in-out infinite" : "none",
            }} />
            <span style={{
              fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
              color: statusColor, letterSpacing: "0.12em",
            }}>{status.toUpperCase()}</span>
          </div>
          <div style={{
            fontFamily: "monospace", fontSize: 11, marginBottom: 4,
            color: presence?.is_working ? "rgba(85,239,196,0.9)" : P.sub,
            fontStyle: presence?.is_working ? "italic" : "normal",
          }}>↳ {activityLabel()}</div>
          {presence && (
            <div style={{ fontFamily: "monospace", fontSize: 10, color: P.dim }}>
              Heartbeat: {heartbeatAgeLabel(presence.last_heartbeat_at)}
            </div>
          )}
        </div>

        {/* Capabilities */}
        <div>
          <div style={{
            fontFamily: "var(--font-pixel, monospace)", fontSize: 5, color: P.sub,
            letterSpacing: "0.2em", marginBottom: 8,
          }}>CAPABILITIES</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
            {caps.map((cap) => (
              <span key={cap} style={{
                fontFamily: "var(--font-pixel, monospace)", fontSize: 5, color: dept.color,
                border: `1px solid ${dept.color}44`, background: `${dept.color}0D`,
                padding: "3px 7px", letterSpacing: "0.08em",
              }}>{cap}</span>
            ))}
          </div>

          {/* Effective tool permissions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[
              { label: "WEB",   allowed: effective.allow_web,   src: effective.sources.allow_web },
              { label: "FILES", allowed: effective.allow_files, src: effective.sources.allow_files },
            ].map(({ label, allowed, src }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  fontFamily: "var(--font-pixel, monospace)", fontSize: 4, letterSpacing: "0.08em",
                  color: allowed ? "#55EFC4" : "#FF6B6B",
                  border: `1px solid ${allowed ? "#55EFC488" : "#FF6B6B88"}`,
                  background: allowed ? "#55EFC40D" : "#FF6B6B0D",
                  padding: "2px 5px",
                }}>{allowed ? "✓" : "✗"} {label}</span>
                <span style={{ fontFamily: "monospace", fontSize: 9, color: P.dim }}>
                  {src === "agent" ? "override" : "policy"}
                </span>
              </div>
            ))}
            {effective.ask_before_tools && (
              <span style={{
                fontFamily: "var(--font-pixel, monospace)", fontSize: 4, color: "#F0C060",
                border: "1px solid #F0C06044", background: "#F0C0600D",
                padding: "2px 5px", letterSpacing: "0.08em", display: "inline-block",
                marginTop: 2,
              }}>🔒 CONSENT ON</span>
            )}
          </div>

          {/* Gmail connection chip */}
          {gmailConnected && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
              <span style={{
                fontFamily: "var(--font-pixel, monospace)", fontSize: 4, letterSpacing: "0.08em",
                color: "#4ECDC4",
                border: "1px solid #4ECDC488",
                background: "#4ECDC40D",
                padding: "2px 5px",
              }}>✉ GMAIL</span>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: P.dim }}>connected</span>
            </div>
          )}

          {/* View policy link */}
          {agent.department && (
            <a href="/agents/policy" style={{
              display: "inline-block", marginTop: 8,
              fontFamily: "var(--font-pixel, monospace)", fontSize: 4, color: P.sub,
              letterSpacing: "0.08em", textDecoration: "none",
              border: `1px solid ${P.border}`, padding: "2px 6px",
            }}>VIEW POLICY →</a>
          )}
        </div>

        {/* Quick actions */}
        <div>
          <div style={{
            fontFamily: "var(--font-pixel, monospace)", fontSize: 5, color: P.sub,
            letterSpacing: "0.2em", marginBottom: 8,
          }}>QUICK ACTIONS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {QUICK_ACTIONS.map((qa) => (
              <button key={qa.label} onClick={() => onQuickAction(qa.text)} style={{
                fontFamily: "var(--font-pixel, monospace)", fontSize: 6, color: P.fg,
                background: P.card, border: `1px solid ${P.border}`, padding: "7px 10px",
                textAlign: "left", cursor: "pointer", letterSpacing: "0.06em",
              }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = dept.color + "88";
                  (e.currentTarget as HTMLButtonElement).style.background  = P.muted;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = P.border;
                  (e.currentTarget as HTMLButtonElement).style.background  = P.card;
                }}
              >▶ {qa.label}</button>
            ))}
          </div>
        </div>

        {/* About */}
        {agent.description && (
          <div>
            <div style={{
              fontFamily: "var(--font-pixel, monospace)", fontSize: 5, color: P.sub,
              letterSpacing: "0.2em", marginBottom: 8,
            }}>ABOUT</div>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: P.sub, lineHeight: 1.5 }}>
              {agent.description}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Debug HUD ───────────────────────────────────────────────────────────── */

function DebugHUD({ agentId, conversationId, presence }: {
  agentId: string; conversationId: string; presence: PresenceData | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (!SHOW_DEBUG) return null;
  const age = presence
    ? Math.floor((Date.now() - new Date(presence.last_heartbeat_at).getTime()) / 1000)
    : null;
  return (
    <div aria-label="Debug overlay" style={{
      position: "fixed", bottom: 12, left: 12, zIndex: 200,
      background: "rgba(6,4,20,0.92)", border: "1px solid #FF6B6B44",
      fontFamily: "monospace", fontSize: 10, color: "#FF6B6B", maxWidth: 260,
    }}>
      <button onClick={() => setCollapsed(c => !c)} style={{
        display: "flex", width: "100%", alignItems: "center", gap: 6,
        padding: "5px 8px", background: "transparent", border: "none", cursor: "pointer",
        fontFamily: "var(--font-pixel, monospace)", fontSize: 5, color: "#FF6B6B",
        letterSpacing: "0.15em",
      }}>
        <span aria-hidden="true">{collapsed ? "▶" : "▼"}</span>
        DEBUG HUD
        <span style={{ marginLeft: "auto", opacity: 0.5 }}>{process.env.NODE_ENV}</span>
      </button>
      {!collapsed && (
        <div style={{ padding: "6px 8px 8px", borderTop: "1px solid #FF6B6B22" }}>
          {[
            { label: "agent",    value: agentId.slice(0, 18) + "…" },
            { label: "conv",     value: conversationId.slice(0, 18) + "…" },
            { label: "presence", value: presence?.presenceStatus ?? "—",
              valueColor: !presence ? "#6868A0" :
                presence.presenceStatus === "live"  ? "rgba(85,239,196,1)" :
                presence.presenceStatus === "stale" ? "#F0C060" : "#6868A0" },
            { label: "working",  value: presence ? String(presence.is_working) : "—" },
            { label: "activity", value: presence?.activity || "—" },
            ...(age !== null ? [{ label: "hb age", value: `${age}s` }] : []),
          ].map(({ label, value, valueColor }) => (
            <div key={label} style={{ display: "flex", gap: 6, marginBottom: 3 }}>
              <span style={{ color: "#6868A0", minWidth: 60 }}>{label}:</span>
              <span style={{ color: valueColor ?? "#E2E2FF", wordBreak: "break-all" }}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */

interface Props {
  agent:                 Agent;
  dept:                  Department;
  conversationId:        string;
  initialMessages:       ConversationMessage[];
  conversations:         ConvSummary[];
  invalidConvRequested?: boolean;
  effectiveSettings:     EffectiveAgentSettings;
  gmailConnected:        boolean;
}

export default function AgentChatClient({
  agent, dept,
  conversationId: initConvId,
  initialMessages,
  conversations:  initConversations,
  invalidConvRequested = false,
  effectiveSettings,
  gmailConnected,
}: Props) {
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────────────────────
  const [conversationId, setConversationId] = useState(initConvId);
  const [convTitle,      setConvTitle]      = useState(
    initConversations.find(c => c.id === initConvId)?.title ?? "New Chat",
  );
  const [messages,       setMessages]       = useState<ChatMsg[]>(
    initialMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content, ts: m.created_at })),
  );
  const [conversations,  setConversations]  = useState<ConvSummary[]>(initConversations);
  const [input,          setInput]          = useState("");
  const [sending,        setSending]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [histLoading,    setHistLoading]    = useState(false);
  const [creating,       setCreating]       = useState(false);
  const [convBanner,     setConvBanner]     = useState(invalidConvRequested);
  const [presence,       setPresence]       = useState<PresenceData | null>(null);
  const [showCabinet,    setShowCabinet]    = useState(false);
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [showClear,      setShowClear]      = useState(false);
  const [clearing,       setClearing]       = useState(false);
  const [pendingIntent,  setPendingIntent]  = useState<ToolIntent | null>(null);
  const [consentLoading, setConsentLoading] = useState(false);
  const [auditEvents,    setAuditEvents]    = useState<AuditEvent[]>([]);
  const [replayingId,    setReplayingId]    = useState<string | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const bottomRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const cabinetRef   = useRef<HTMLDivElement>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendingRef   = useRef(false);
  // Saved context when a tool_intent response pauses the send flow
  const pendingSendRef = useRef<{
    chatHistory:   ChatMsg[];
    userMessageId: string;
    wasFirst:      boolean;
  } | null>(null);

  const isFirstMsg = messages.length === 0;

  // ── Merged timeline: messages + audit events, sorted by timestamp ───────────
  const timelineItems = useMemo((): TimelineItem[] => {
    const items: TimelineItem[] = [];
    messages.forEach((msg, i) => {
      // Use stored ts if available, fall back to index string (stable sort order)
      items.push({ kind: "msg", msg, ts: msg.ts ?? `0000-${String(i).padStart(6, "0")}` });
    });
    auditEvents.forEach((ev) => {
      items.push({ kind: "event", ev, ts: ev.created_at });
    });
    return items.sort((a, b) => a.ts.localeCompare(b.ts));
  }, [messages, auditEvents]);

  useEffect(() => { sendingRef.current = sending; }, [sending]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  /* Close filing cabinet on outside click */
  useEffect(() => {
    if (!showCabinet) return;
    function onOutside(e: MouseEvent) {
      if (cabinetRef.current && !cabinetRef.current.contains(e.target as Node)) {
        setShowCabinet(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [showCabinet]);

  /* Presence poll — every 5 s */
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/agents/presence?agentIds=${encodeURIComponent(agent.id)}`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { presence: Record<string, PresenceData> };
        const p = data.presence?.[agent.id];
        if (p && !cancelled) setPresence(p);
      } catch {}
    }
    poll();
    const iv = setInterval(poll, 5_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [agent.id]);

  /* Load audit events for the current conversation */
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    fetch(`/api/tool-audit?conversationId=${encodeURIComponent(conversationId)}&limit=50`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: { entries?: AuditEvent[] } | null) => {
        if (!cancelled && d?.entries) setAuditEvents(d.entries);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [conversationId]);

  /* Clean up heartbeat on unmount */
  useEffect(() => {
    const agentId = agent.id;
    return () => {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      fetch("/api/agents/presence/heartbeat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, isWorking: false, note: "" }),
      }).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id]);

  /* Tab visibility */
  useEffect(() => {
    const agentId = agent.id;
    function onVisibility() {
      if (document.hidden) {
        if (sendingRef.current) {
          if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
          fetch("/api/agents/presence/heartbeat", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId, isWorking: false, note: "" }),
          }).catch(() => {});
        }
      } else {
        if (sendingRef.current) {
          fetch("/api/agents/presence/heartbeat", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId, isWorking: true, note: "Generating reply..." }),
          }).catch(() => {});
          if (!heartbeatRef.current) {
            heartbeatRef.current = setInterval(() => {
              fetch("/api/agents/presence/heartbeat", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ agentId, isWorking: true, note: "Generating reply..." }),
              }).catch(() => {});
            }, 5_000);
          }
        }
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id]);

  /* System prompt — base + capability instructions */
  const systemPrompt =
    (agent.system_prompt ||
      `You are ${agent.name}, an AI agent specializing in ${dept.tagline} for the ${dept.label} department. ` +
      `${dept.description} ` +
      `Be helpful, professional, and concise. Respond in plain text.`)
    + buildCapabilityInstructions(effectiveSettings);

  // ── Heartbeat helpers ─────────────────────────────────────────────────────
  function sendHeartbeat(isWorking: boolean, note = "", activity = "", detail = "") {
    fetch("/api/agents/presence/heartbeat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: agent.id, isWorking, note, activity, detail }),
    }).catch(() => {});
  }
  function stopHeartbeat() {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
  }

  // ── Quick action ──────────────────────────────────────────────────────────
  function handleQuickAction(text: string) {
    setInput(text);
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // ── Auto-title push-back (after first message is sent) ────────────────────
  // After the server auto-titles the conversation, we re-fetch the title to
  // reflect it in the filing cabinet without requiring a full page reload.
  async function refreshTitle(convId: string) {
    try {
      const res = await fetch(`/api/conversations/${convId}`);
      if (!res.ok) return;
      const data = await res.json() as { conversation?: { title?: string } };
      const newTitle = data.conversation?.title;
      if (newTitle && newTitle !== "New Chat") {
        setConvTitle(newTitle);
        setConversations(prev =>
          prev.map(c => c.id === convId ? { ...c, title: newTitle } : c),
        );
      }
    } catch {}
  }

  // ── Rename thread ─────────────────────────────────────────────────────────
  async function renameConversation(convId: string, newTitle: string) {
    try {
      await fetch("/api/conversations/title", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, title: newTitle }),
      });
      setConversations(prev =>
        prev.map(c => c.id === convId ? { ...c, title: newTitle } : c),
      );
      if (convId === conversationId) setConvTitle(newTitle);
    } catch {}
  }

  // ── Export thread ─────────────────────────────────────────────────────────
  function exportThread() {
    const url = `/api/conversations/export?conversationId=${encodeURIComponent(conversationId)}&agentName=${encodeURIComponent(agent.name)}`;
    // Trigger browser download
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── Clear thread ──────────────────────────────────────────────────────────
  async function clearThread() {
    setClearing(true);
    try {
      const res = await fetch("/api/conversations/clear", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) { setError("Could not clear thread."); return; }
      setMessages([]);
      setAuditEvents([]);
      setConvTitle("New Chat");
      setConversations(prev =>
        prev.map(c => c.id === conversationId ? { ...c, title: "New Chat" } : c),
      );
    } catch {
      setError("Network error — could not clear thread.");
    } finally {
      setClearing(false);
      setShowClear(false);
    }
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  const isFirstSend = useRef(true);

  // Core send implementation — accepts an optional consent override to bypass tool_intent check
  const sendWithOverride = useCallback(async (
    chatHistory:          ChatMsg[],
    userMessageId:        string,
    wasFirst:             boolean,
    consentOverride?:     { tool: ConsentTool; allowOnce: true },
  ) => {
    // Always enable consent mode — this client supports tool_intent responses.
    // The server decides per-tool whether to pause (Gmail: whenever connected;
    // web/files: only when agent has ask_before_tools enabled).
    const useConsentMode = !consentOverride;

    sendHeartbeat(true, "Responding...", "responding");
    heartbeatRef.current = setInterval(() => {
      sendHeartbeat(true, "Generating reply...", "responding");
    }, 5_000);

    try {
      const res = await fetch("/api/openclaw/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: agent.default_model || "openclaw:main",
          messages: [{ role: "system", content: systemPrompt }, ...chatHistory],
          conversationId, userMessageId, stream: false,
          agentId: agent.id,
          toolConsentMode: useConsentMode,
          ...(consentOverride ? { toolConsentOverride: consentOverride } : {}),
        }),
      });

      const data = await res.json() as {
        type?:    string;
        intent?:  ToolIntent;
        choices?: { message?: { content?: string } }[];
        message?: { content?: string };
        content?: string;
        error?:   string;
      };

      // ── Tool intent — pause and ask ──────────────────────────────────────
      if (data.type === "tool_intent" && data.intent) {
        // Save context so consent handlers can replay the same send
        pendingSendRef.current = { chatHistory, userMessageId, wasFirst };
        setPendingIntent(data.intent);
        // Stop sending state (UI should show modal, not loading)
        stopHeartbeat();
        sendHeartbeat(false, "", "idle");
        setSending(false);
        return;
      }

      if (!res.ok) { setError(data.error ?? `Error ${res.status}`); return; }

      const reply =
        data.choices?.[0]?.message?.content ??
        data.message?.content ??
        data.content ?? "";

      if (reply) {
        const now = new Date().toISOString();
        setMessages((prev) => [...prev, { role: "assistant", content: reply, ts: now }]);
        setConversations((prev) =>
          prev.map((c) => c.id === conversationId ? { ...c, updated_at: now } : c)
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
        );
        if (wasFirst) void refreshTitle(conversationId);
      } else {
        setError("Received empty response from agent.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      stopHeartbeat();
      sendHeartbeat(false, "", "idle");
      setSending(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, conversationId, systemPrompt]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const wasFirst = isFirstSend.current && messages.length === 0;

    setInput("");
    setError(null);
    const userMsg: ChatMsg = { role: "user", content: text, ts: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    isFirstSend.current = false;

    const chatHistory:   ChatMsg[] = [...messages, userMsg];
    const userMessageId: string    = genId();

    await sendWithOverride(chatHistory, userMessageId, wasFirst);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, sending, messages, sendWithOverride]);

  // ── Consent handlers ───────────────────────────────────────────────────────

  async function handleAllowOnce() {
    if (!pendingIntent || !pendingSendRef.current) return;
    setConsentLoading(true);
    const { chatHistory, userMessageId, wasFirst } = pendingSendRef.current;
    const intent = pendingIntent;
    const tool   = intent.tool;

    // Optimistic event card
    setAuditEvents((prev) => [{
      id:          crypto.randomUUID?.() ?? `ev-${Date.now()}`,
      tool,
      decision:    "allow_once",
      reason:      intent.reason,
      query:       intent.query,
      created_at:  new Date().toISOString(),
      // No replayContext for allow_once (it succeeded; no need to replay deny)
    }, ...prev]);

    setPendingIntent(null);
    pendingSendRef.current = null;
    setConsentLoading(false);
    setSending(true);
    await sendWithOverride(chatHistory, userMessageId, wasFirst, { tool, allowOnce: true });
  }

  async function handleAlwaysAllow() {
    if (!pendingIntent || !pendingSendRef.current) return;
    setConsentLoading(true);
    const { chatHistory, userMessageId, wasFirst } = pendingSendRef.current;
    const tool = pendingIntent.tool;

    // Patch agent settings: disable ask_before for this specific tool + mark as override
    try {
      await fetch(`/api/agents/${agent.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(
          tool === "web"
            ? { ask_before_web: false, override_ask_before_web: true }
            : { ask_before_files: false, override_ask_before_files: true }
        ),
      });
    } catch {
      // Non-fatal — proceed anyway
    }

    // Log audit decision
    try {
      await fetch("/api/tool-audit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          agent_id:        agent.id,
          tool,
          decision:        "always_allow",
          reason:          pendingIntent.reason,
          query:           pendingIntent.query,
        }),
      });
    } catch {}

    // Optimistic event card for always_allow
    setAuditEvents((prev) => [{
      id:         crypto.randomUUID?.() ?? `ev-${Date.now()}`,
      tool,
      decision:   "always_allow",
      reason:     pendingIntent.reason,
      query:      pendingIntent.query,
      created_at: new Date().toISOString(),
    }, ...prev]);

    setPendingIntent(null);
    pendingSendRef.current = null;
    setConsentLoading(false);
    setSending(true);
    await sendWithOverride(chatHistory, userMessageId, wasFirst, { tool, allowOnce: true });
  }

  async function handleDeny() {
    if (!pendingIntent) return;
    const tool      = pendingIntent.tool;
    const toolLabel = tool === "web" ? "web search" : tool === "gmail" ? "Gmail" : "file search";
    const reason    = pendingIntent.reason;
    const query     = pendingIntent.query;

    // Log audit decision
    try {
      await fetch("/api/tool-audit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          agent_id:        agent.id,
          tool,
          decision:        "deny",
          reason,
          query,
        }),
      });
    } catch {}

    // Optimistic event card — with replayContext so user can replay after denial
    const savedSendCtx = pendingSendRef.current;
    setAuditEvents((prev) => [{
      id:          crypto.randomUUID?.() ?? `ev-${Date.now()}`,
      tool,
      decision:    "deny",
      reason,
      query,
      created_at:  new Date().toISOString(),
      // Attach context so the "Run with tool now" button can replay
      ...(savedSendCtx ? { replayContext: savedSendCtx } : {}),
    }, ...prev]);

    // Append a local assistant message explaining the denial
    const now     = new Date().toISOString();
    const denyMsg = `Okay — I won't use ${toolLabel}. Want me to answer using what's already available?`;
    setMessages((prev) => [...prev, { role: "assistant", content: denyMsg, ts: now }]);

    pendingSendRef.current = null;
    setPendingIntent(null);
    setSending(false);
  }

  // ── Replay a denied tool event ─────────────────────────────────────────────
  async function replayEvent(ev: AuditEvent) {
    if (sending || replayingId) return;
    setReplayingId(ev.id);
    setSending(true);
    setError(null);

    let chatHistory: ChatMsg[];
    let userMessageId: string;
    let wasFirst: boolean;

    if (ev.replayContext) {
      // Use the exact context saved at deny time
      ({ chatHistory, userMessageId, wasFirst } = ev.replayContext);
    } else {
      // Historical event — reconstruct from current messages
      chatHistory   = messages;
      userMessageId = crypto.randomUUID?.() ?? `msg-${Date.now()}`;
      wasFirst      = messages.length === 0;
    }

    try {
      // Log audit for this replay
      await fetch("/api/tool-audit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          agent_id:        agent.id,
          tool:            ev.tool,
          decision:        "allow_once",
          reason:          "Replay after deny",
          query:           ev.query,
        }),
      });
    } catch {}

    // Mark the event card as replayed (decision updated locally)
    setAuditEvents((prev) =>
      prev.map((e) => e.id === ev.id ? { ...e, replayContext: undefined } : e),
    );

    await sendWithOverride(chatHistory, userMessageId, wasFirst, { tool: ev.tool, allowOnce: true });
    setReplayingId(null);
  }

  // ── New conversation ───────────────────────────────────────────────────────
  async function newConversation() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations/new", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id }),
      });
      if (!res.ok) { setError("Could not create new conversation."); return; }
      const data = await res.json() as { conversationId: string; title: string; created_at: string };
      const now  = new Date().toISOString();
      setConversationId(data.conversationId);
      setConvTitle(data.title || "New Chat");
      setMessages([]);
      isFirstSend.current = true;
      setConversations((prev) => [
        { id: data.conversationId, title: data.title || "New Chat", updated_at: now }, ...prev,
      ]);
      setShowCabinet(false);
      router.push(`?c=${data.conversationId}`, { scroll: false });
    } catch {
      setError("Network error — could not create conversation.");
    } finally {
      setCreating(false);
    }
  }

  // ── Switch conversation ────────────────────────────────────────────────────
  async function switchConversation(id: string) {
    if (id === conversationId || histLoading) return;
    setHistLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      if (!res.ok) { setError("Could not load conversation."); return; }
      const msgs = await res.json() as ConversationMessage[];
      setMessages(msgs.map((m) => ({ role: m.role as "user" | "assistant", content: m.content, ts: m.created_at })));
      setAuditEvents([]); // cleared; will reload via the conversationId effect
      setConversationId(id);
      const found = conversations.find(c => c.id === id);
      setConvTitle(found?.title ?? "New Chat");
      isFirstSend.current = msgs.length === 0;
      setShowCabinet(false);
      router.push(`?c=${id}`, { scroll: false });
    } catch {
      setError("Network error — could not load conversation.");
    } finally {
      setHistLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === "Escape") { setShowCabinet(false); setSidebarOpen(false); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes typing-dot {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
          40%            { transform: scale(1.2); opacity: 1; }
        }
        @keyframes status-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        .agent-brain-sidebar {
          width: 240px; flex-shrink: 0;
          border-left: 1px solid #1E1E44; background: #10102A; overflow-y: auto;
        }
        .sidebar-close-btn  { display: none !important; }
        .sidebar-toggle-btn { display: none !important; }
        @media (max-width: 768px) {
          .agent-brain-sidebar {
            position: fixed; top: 0; right: 0; height: 100%; z-index: 50;
            transform: translateX(100%); transition: transform 0.2s ease; width: 280px;
            border-left: 1px solid #1E1E44;
          }
          .agent-brain-sidebar.sidebar-open { transform: translateX(0); }
          .sidebar-close-btn  { display: flex !important; }
          .sidebar-toggle-btn { display: flex !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>

      {/* Clear modal */}
      {showClear && (
        <ClearModal onConfirm={clearThread} onCancel={() => setShowClear(false)} clearing={clearing} />
      )}

      {/* Tool consent modal */}
      {pendingIntent && (
        <ToolConsentModal
          intent={pendingIntent}
          dept={dept}
          onAllowOnce={handleAllowOnce}
          onAlwaysAllow={handleAlwaysAllow}
          onDeny={handleDeny}
          loading={consentLoading}
        />
      )}

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div aria-hidden="true" onClick={() => setSidebarOpen(false)} style={{
          position: "fixed", inset: 0, zIndex: 49, background: "rgba(0,0,0,0.55)",
        }} />
      )}

      <div style={{
        display: "flex", flexDirection: "column", height: "100vh",
        background: P.bg, color: P.fg, overflow: "hidden",
      }}>

        {/* ── Top header ──────────────────────────────────────────────── */}
        <header style={{
          flexShrink: 0, borderBottom: `1px solid ${P.border}`,
          background: P.bg, zIndex: 10, position: "relative",
        }}>
          <div style={{
            height: 2,
            background: `linear-gradient(90deg, ${dept.color}, ${dept.dark}, transparent)`,
          }} />
          <div style={{
            padding: "12px 20px", display: "flex", alignItems: "center",
            gap: 12, flexWrap: "wrap",
          }}>
            <Link href={`/agents/${dept.id}`} style={{
              fontFamily: "var(--font-pixel, monospace)", fontSize: 7, color: P.sub,
              textDecoration: "none", border: `1px solid ${P.border}`,
              padding: "5px 9px", letterSpacing: "0.12em", whiteSpace: "nowrap",
            }}>← {dept.label.toUpperCase()}</Link>

            <div style={{
              width: 36, height: 36, background: dept.color, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, border: `1px solid ${dept.dark}`, imageRendering: "pixelated",
            }} aria-hidden="true">{dept.emoji}</div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: "var(--font-pixel, monospace)", fontSize: 7, color: dept.color,
                letterSpacing: "0.05em", lineHeight: 1.3, textShadow: `0 0 10px ${dept.glow}`,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {agent.name}
                {convTitle && convTitle !== "New Chat" && (
                  <span style={{ color: P.sub, fontSize: 6, marginLeft: 8, letterSpacing: "0.08em" }}>
                    · {convTitle.length > 28 ? convTitle.slice(0, 28) + "…" : convTitle}
                  </span>
                )}
              </div>
              <div style={{
                fontFamily: "monospace", fontSize: 10, color: P.sub, marginTop: 2,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{dept.tagline}</div>
            </div>

            {/* Controls */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>

              {/* Export */}
              <button
                onClick={exportThread}
                disabled={messages.length === 0}
                aria-label="Export conversation as Markdown"
                title="Export as .md"
                style={{
                  fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
                  color: messages.length === 0 ? P.dim : P.sub, background: "transparent",
                  border: `1px solid ${messages.length === 0 ? P.dim : P.border}`,
                  padding: "6px 8px", cursor: messages.length === 0 ? "not-allowed" : "pointer",
                  letterSpacing: "0.1em",
                }}
              >↓ MD</button>

              {/* Clear */}
              <button
                onClick={() => setShowClear(true)}
                disabled={messages.length === 0}
                aria-label="Clear conversation"
                title="Clear messages"
                style={{
                  fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
                  color: messages.length === 0 ? P.dim : "#FF6B6B88", background: "transparent",
                  border: `1px solid ${messages.length === 0 ? P.dim : "#FF6B6B33"}`,
                  padding: "6px 8px", cursor: messages.length === 0 ? "not-allowed" : "pointer",
                  letterSpacing: "0.1em",
                }}
              >✕ CLR</button>

              {/* Filing cabinet */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowCabinet((s) => !s)}
                  aria-label="Conversation threads"
                  aria-expanded={showCabinet}
                  style={{
                    fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
                    color: showCabinet ? dept.color : P.sub, background: "transparent",
                    border: `1px solid ${showCabinet ? dept.color : P.border}`,
                    padding: "6px 10px", cursor: "pointer", letterSpacing: "0.1em", whiteSpace: "nowrap",
                  }}
                >🗂 {conversations.length}</button>

                {showCabinet && (
                  <FilingCabinetPanel
                    conversations={conversations}
                    conversationId={conversationId}
                    histLoading={histLoading}
                    creating={creating}
                    dept={dept}
                    cabinetRef={cabinetRef}
                    onSwitch={switchConversation}
                    onNew={newConversation}
                    onClose={() => setShowCabinet(false)}
                    onRename={renameConversation}
                  />
                )}
              </div>

              {/* Mobile sidebar toggle */}
              <button
                className="sidebar-toggle-btn"
                onClick={() => setSidebarOpen((s) => !s)}
                aria-label="Toggle agent info sidebar"
                style={{
                  fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
                  color: sidebarOpen ? dept.color : P.sub, background: "transparent",
                  border: `1px solid ${sidebarOpen ? dept.color : P.border}`,
                  padding: "6px 10px", cursor: "pointer", letterSpacing: "0.1em", whiteSpace: "nowrap",
                }}
              >🧠 INFO</button>
            </div>

            {/* Working indicator */}
            <div style={{
              fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
              color: sending ? dept.color : "rgba(85,239,196,0.8)",
              letterSpacing: "0.15em", whiteSpace: "nowrap", flexShrink: 0,
            }}>{sending ? "● WORKING..." : "● IN THE ROOM"}</div>
          </div>
        </header>

        {/* ── Body: chat + sidebar ─────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* Chat column */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Message log */}
            <div role="log" aria-label="Chat messages" aria-live="polite"
              style={{ flex: 1, overflowY: "auto", padding: "20px 20px 8px" }}>

              {/* Welcome */}
              {isFirstMsg && (
                <div style={{ textAlign: "center", padding: "40px 24px", color: P.sub }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }} aria-hidden="true">{dept.emoji}</div>
                  <div style={{
                    fontFamily: "var(--font-pixel, monospace)", fontSize: 8, color: dept.color,
                    letterSpacing: "0.1em", marginBottom: 12, textShadow: `0 0 12px ${dept.glow}`,
                  }}>{agent.name.toUpperCase()}</div>
                  <div style={{
                    fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 13,
                    color: P.sub, lineHeight: 1.6, maxWidth: 400, margin: "0 auto",
                  }}>
                    {agent.description || `Your ${dept.label.toLowerCase()} agent is ready. What can I help you with?`}
                  </div>
                </div>
              )}

              {/* Messages */}
              {histLoading ? (
                <div style={{
                  textAlign: "center", padding: "40px 24px",
                  fontFamily: "var(--font-pixel, monospace)", fontSize: 7,
                  color: P.sub, letterSpacing: "0.15em",
                }}>LOADING...</div>
              ) : (
                timelineItems.map((item, i) =>
                  item.kind === "msg" ? (
                    item.msg.role === "user" ? (
                      <UserBubble key={i} content={item.msg.content} />
                    ) : (
                      <AssistantBubble key={i} content={item.msg.content} emoji={dept.emoji} color={dept.color} />
                    )
                  ) : (
                    <EventCard
                      key={item.ev.id}
                      ev={item.ev}
                      dept={dept}
                      onReplay={item.ev.decision === "deny" && item.ev.replayContext
                        ? () => void replayEvent(item.ev)
                        : undefined}
                      replaying={replayingId === item.ev.id}
                    />
                  )
                )
              )}

              {sending && <TypingDots color={dept.color} emoji={dept.emoji} />}

              {/* Invalid conv banner */}
              {convBanner && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
                  color: "#F0C060", border: "1px solid #6A5020", background: "#1A140A",
                  padding: "8px 12px", marginBottom: 12, letterSpacing: "0.08em",
                }}>
                  <span style={{ flex: 1 }}>⚠ CONVERSATION NOT FOUND — SHOWING DEFAULT THREAD</span>
                  <button onClick={() => setConvBanner(false)} aria-label="Dismiss" style={{
                    fontFamily: "var(--font-pixel, monospace)", fontSize: 6,
                    color: "#F0C060", background: "transparent", border: "none",
                    cursor: "pointer", padding: "2px 4px", flexShrink: 0,
                  }}>✕</button>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  fontFamily: "var(--font-pixel, monospace)", fontSize: 7, color: "#FF6B6B",
                  border: "1px solid #FF6B6B", padding: "8px 12px", marginBottom: 12, letterSpacing: "0.1em",
                }}>✖ {error.toUpperCase()}</div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input area */}
            <div style={{
              flexShrink: 0, borderTop: `1px solid ${P.border}`,
              background: P.surface, padding: "12px 20px",
            }}>
              <div style={{
                display: "flex", gap: 10, alignItems: "flex-end", maxWidth: 860, margin: "0 auto",
              }}>
                <textarea
                  ref={inputRef}
                  rows={2}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${agent.name}… (Enter to send, Shift+Enter for new line)`}
                  aria-label={`Message ${agent.name}`}
                  disabled={sending || histLoading}
                  style={{
                    flex: 1, fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 13,
                    padding: "10px 12px", background: P.bg,
                    border: `1px solid ${(sending || histLoading) ? P.border : P.sub}`,
                    color: P.fg, outline: "none", resize: "none", lineHeight: 1.5, borderRadius: 0,
                  }}
                />
                <button
                  onClick={send}
                  disabled={sending || histLoading || !input.trim()}
                  aria-label="Send message"
                  style={{
                    flexShrink: 0, fontFamily: "var(--font-pixel, monospace)", fontSize: 7,
                    color: P.bg,
                    background: (sending || histLoading || !input.trim()) ? P.sub : dept.color,
                    border: "none", padding: "0 16px",
                    cursor: (sending || histLoading || !input.trim()) ? "not-allowed" : "pointer",
                    letterSpacing: "0.1em", height: 58,
                  }}
                >{sending ? "..." : "SEND →"}</button>
              </div>
              <div style={{
                fontFamily: "var(--font-pixel, monospace)", fontSize: 6, color: P.dim,
                textAlign: "center", marginTop: 6, letterSpacing: "0.15em",
              }}>ENTER TO SEND · SHIFT+ENTER FOR NEW LINE · HISTORY SAVED</div>
            </div>
          </div>

          {/* Agent Brain Sidebar */}
          <div className={`agent-brain-sidebar${sidebarOpen ? " sidebar-open" : ""}`}>
            <AgentBrainSidebar
              agent={agent} dept={dept} presence={presence}
              effective={effectiveSettings}
              gmailConnected={gmailConnected}
              onQuickAction={handleQuickAction}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      </div>

      <DebugHUD agentId={agent.id} conversationId={conversationId} presence={presence} />
    </>
  );
}
