"use client";

/**
 * app/officebuilding/OfficeBuildingClient.tsx
 * Chat workspace — StartClaw design language.
 * Palette: #F7F7F4 bg · #FFFFFF card · #F0F0EC muted · #1A1A17 fg · #E8E8E4 border
 */

import { useRef, useEffect, useState, useMemo, KeyboardEvent } from "react";
import type { ChatCompletionResponse } from "@/lib/openclaw";
import type { ChatMode } from "@/lib/llm";
import { ToolsPanel }                           from "./ToolsPanel";
import { ToolSuggestionCard }                   from "./ToolSuggestionCard";
import { suggestTool, type ToolSuggestion, type SlimProvider } from "./toolSuggester";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string; // ISO string — shown below each bubble
}

/** Client-side mirror of lib/conversations.ts Conversation (no server import). */
interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_model: string;
  agent_id:   string;
}

/** Client-side mirror of ConversationMessage. */
interface ConvMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

const INFO_CODES = new Set([
  "CHAT_DISABLED",
  "ENDPOINT_NOT_FOUND",
  "NOT_REST_COMPATIBLE",
]);

// ─── Palette constants ────────────────────────────────────────────────────────

const P = {
  bg: "#F7F7F4",
  card: "#FFFFFF",
  muted: "#F0F0EC",
  fg: "#1A1A17",
  fgHover: "#333330",
  fgLight: "#F7F7F4",
  border: "#E8E8E4",
  sub: "#6B6B60",
  placeholder: "#A8A89C",
  dark: "#0C0B09",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Format a message timestamp: time-only within 24 h, date + time beyond. */
function formatMsgTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 86_400_000) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return (
    d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UserBubble({ content, timestamp }: { content: string; timestamp?: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[78%]">
        <div
          className="rounded-2xl rounded-tr-sm px-4 py-3"
          style={{ background: P.fg }}
        >
          <p
            className="text-sm whitespace-pre-wrap leading-relaxed"
            style={{ color: P.fgLight }}
          >
            {content}
          </p>
        </div>
        {timestamp && (
          <div className="flex justify-end mt-1">
            <span className="text-[10px] pr-1" style={{ color: P.placeholder }}>
              {formatMsgTime(timestamp)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  onCopy,
  copied,
  timestamp,
  onRegenerate,
}: {
  content: string;
  onCopy: () => void;
  copied: boolean;
  timestamp?: string;
  onRegenerate?: () => void;
}) {
  return (
    <div className="flex justify-start group">
      <div className="max-w-[78%]">
        <div
          className="rounded-2xl rounded-tl-sm px-4 py-3"
          style={{
            background: P.card,
            border: `1px solid ${P.border}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <p
            className="text-sm whitespace-pre-wrap leading-relaxed"
            style={{ color: P.fg }}
          >
            {content}
          </p>
        </div>

        {/* Action row: timestamp always visible; copy + regenerate appear on hover */}
        <div className="flex items-center gap-3 mt-1.5 pl-1">
          {timestamp && (
            <span className="text-[10px]" style={{ color: P.placeholder }}>
              {formatMsgTime(timestamp)}
            </span>
          )}

          {/* Copy button */}
          <button
            onClick={onCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs"
            style={{ color: P.placeholder }}
          >
            {copied ? (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </>
            )}
          </button>

          {/* Regenerate button — only rendered on the last assistant message */}
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs"
              style={{ color: P.placeholder }}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div
        className="rounded-2xl rounded-tl-sm px-4 py-3"
        style={{
          background: P.card,
          border: `1px solid ${P.border}`,
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{
                background: P.border,
                animationDelay: `${i * 150}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DisabledNotice() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
        style={{
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.2)",
        }}
      >
        <svg
          className="w-5 h-5"
          style={{ color: "#d97706" }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <p className="text-sm font-semibold" style={{ color: P.fg }}>
        No REST endpoint configured
      </p>
      <p className="text-xs mt-1.5 max-w-xs leading-relaxed" style={{ color: P.sub }}>
        The OpenClaw gateway is running, but the REST chat API isn&apos;t wired
        up yet.
      </p>
      <div
        className="mt-5 rounded-xl px-4 py-3 text-left max-w-xs w-full"
        style={{ background: P.muted, border: `1px solid ${P.border}` }}
      >
        <p className="text-xs mb-1.5" style={{ color: P.sub }}>
          To enable chat, set in{" "}
          <span
            className="font-mono"
            style={{ color: P.fg }}
          >
            .env.local
          </span>
          :
        </p>
        <code className="text-xs font-mono" style={{ color: P.fg }}>
          STARTCLAW_CHAT_MODE=openclaw
        </code>
      </div>
    </div>
  );
}

function InfoBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="mx-6 mb-2 flex items-start gap-3 rounded-xl px-4 py-3 shrink-0"
      style={{
        background: "rgba(245,158,11,0.06)",
        border: "1px solid rgba(245,158,11,0.18)",
      }}
    >
      <svg
        className="w-4 h-4 shrink-0 mt-0.5"
        style={{ color: "#d97706" }}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p className="flex-1 text-xs leading-relaxed" style={{ color: "#92400e" }}>
        {message}
      </p>
      <button
        onClick={onDismiss}
        className="shrink-0 transition-opacity hover:opacity-70"
        style={{ color: "#d97706" }}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ─── Conversation sidebar ─────────────────────────────────────────────────────

function ConversationSidebar({
  conversations,
  activeId,
  loading,
  onSelect,
  onNewChat,
  onDelete,
  onRename,
}: {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  onSelect: (conv: Conversation) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [openMenu, setOpenMenu]           = useState<{ id: string; top: number; left: number } | null>(null);
  const [hoveredId, setHoveredId]         = useState<string | null>(null);
  const [renamePopup, setRenamePopup]     = useState<{ id: string; value: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const dropdownRef                       = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside — uses contains() so clicks INSIDE
  // the dropdown (on Delete/Rename/Share) don't race against the close listener.
  useEffect(() => {
    if (!openMenu) return;
    const close = (e: MouseEvent) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpenMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openMenu]);

  function submitRenamePopup() {
    if (!renamePopup) return;
    const trimmed = renamePopup.value.trim();
    if (trimmed) onRename(renamePopup.id, trimmed);
    setRenamePopup(null);
  }

  function handleShare(id: string) {
    setOpenMenu(null);
    navigator.clipboard
      .writeText(`${window.location.origin}/officebuilding?conv=${id}`)
      .catch(() => {});
  }

  const menuItemStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "7px 12px",
    fontSize: 12,
    border: "none",
    background: "transparent",
    color: P.fg,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        width: 210,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: P.card,
        borderRight: `1px solid ${P.border}`,
        overflow: "hidden",
      }}
    >
      {/* New Chat button */}
      <div style={{ padding: "12px 8px 6px", flexShrink: 0 }}>
        <button
          onClick={onNewChat}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 10px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            border: `1px solid ${P.border}`,
            background: P.muted,
            color: P.sub,
            cursor: "pointer",
          }}
        >
          <svg
            style={{ width: 13, height: 13, flexShrink: 0 }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Rename popup */}
      {renamePopup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.18)",
          }}
          onMouseDown={() => setRenamePopup(null)}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              border: `1px solid ${P.border}`,
              borderRadius: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
              padding: "18px 20px 16px",
              width: 280,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 600, color: P.fg, margin: 0 }}>
              Rename chat
            </p>
            <input
              autoFocus
              value={renamePopup.value}
              onChange={(e) => setRenamePopup((p) => p ? { ...p, value: e.target.value } : null)}
              onKeyDown={(e) => {
                if (e.key === "Enter")  { e.preventDefault(); submitRenamePopup(); }
                if (e.key === "Escape") { setRenamePopup(null); }
              }}
              style={{
                width: "100%",
                fontSize: 13,
                color: P.fg,
                background: P.bg,
                border: `1px solid ${P.border}`,
                borderRadius: 8,
                padding: "8px 10px",
                outline: "none",
                boxSizing: "border-box",
              }}
              placeholder="Chat name"
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setRenamePopup(null)}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  padding: "6px 14px",
                  borderRadius: 7,
                  border: `1px solid ${P.border}`,
                  background: P.muted,
                  color: P.sub,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={submitRenamePopup}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 14px",
                  borderRadius: 7,
                  border: "none",
                  background: P.fg,
                  color: "#F7F7F4",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation popup */}
      {deleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.18)",
          }}
          onMouseDown={() => setDeleteConfirm(null)}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              border: `1px solid ${P.border}`,
              borderRadius: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
              padding: "20px 20px 16px",
              width: 280,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 600, color: P.fg, margin: 0 }}>
              Delete chat?
            </p>
            <p style={{ fontSize: 12, color: P.sub, margin: 0, lineHeight: 1.5 }}>
              &ldquo;{deleteConfirm.title}&rdquo; will be permanently deleted.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  padding: "6px 14px",
                  borderRadius: 7,
                  border: `1px solid ${P.border}`,
                  background: P.muted,
                  color: P.sub,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete(deleteConfirm.id);
                  setDeleteConfirm(null);
                }}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 14px",
                  borderRadius: 7,
                  border: "none",
                  background: "#dc2626",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dropdown menu — rendered as position:fixed so overflow:hidden/auto never clips it */}
      {openMenu && (() => {
        const conv = conversations.find((c) => c.id === openMenu.id);
        if (!conv) return null;
        return (
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: openMenu.top,
              left: openMenu.left,
              zIndex: 500,
              background: "#fff",
              border: `1px solid ${P.border}`,
              borderRadius: 8,
              boxShadow: "0 4px 18px rgba(0,0,0,0.14)",
              minWidth: 148,
              overflow: "hidden",
            }}
          >
            <button
              style={menuItemStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = P.muted)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              onClick={() => handleShare(openMenu.id)}
            >
              Share
            </button>
            <button
              style={menuItemStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = P.muted)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              onClick={() => {
                setOpenMenu(null);
                setRenamePopup({ id: conv.id, value: conv.title });
              }}
            >
              Rename
            </button>
            <button
              style={{ ...menuItemStyle, color: "#dc2626" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#fef2f2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              onClick={() => {
                setOpenMenu(null);
                setDeleteConfirm({ id: conv.id, title: conv.title });
              }}
            >
              Delete
            </button>
          </div>
        );
      })()}

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 4px 12px" }}>
        {loading ? (
          <p style={{ fontSize: 11, color: P.placeholder, textAlign: "center", padding: "20px 0" }}>
            Loading…
          </p>
        ) : conversations.length === 0 ? (
          <p style={{ fontSize: 11, color: P.placeholder, textAlign: "center", padding: "20px 8px", lineHeight: 1.5 }}>
            No conversations yet
          </p>
        ) : (
          conversations.map((conv) => {
            const isActive  = conv.id === activeId;
            const isHovered = hoveredId === conv.id;
            const menuOpen  = openMenu?.id === conv.id;

            return (
              <div
                key={conv.id}
                style={{ position: "relative", marginBottom: 1 }}
                onMouseEnter={() => setHoveredId(conv.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Clickable row */}
                <button
                  onClick={() => { setOpenMenu(null); onSelect(conv); }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "7px 28px 7px 8px",
                    borderRadius: 7,
                    border: "none",
                    cursor: "pointer",
                    background: isActive ? P.muted : "transparent",
                    display: "block",
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? P.fg : P.sub,
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {conv.title}
                  </p>
                  <p style={{ fontSize: 10, color: P.placeholder, margin: "2px 0 0" }}>
                    {formatRelTime(conv.updated_at)}
                  </p>
                </button>

                {/* 3-dot button — visible on hover or when menu is open */}
                {(isHovered || menuOpen) && (
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (menuOpen) {
                        setOpenMenu(null);
                      } else {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setOpenMenu({
                          id: conv.id,
                          top: rect.bottom + 4,
                          left: Math.max(4, rect.right - 148),
                        });
                      }
                    }}
                    style={{
                      position: "absolute",
                      right: 4,
                      top: "50%",
                      transform: "translateY(-50%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      border: "none",
                      background: menuOpen ? P.muted : "transparent",
                      color: P.sub,
                      cursor: "pointer",
                      fontSize: 14,
                      letterSpacing: 1,
                      lineHeight: 1,
                      padding: 0,
                    }}
                    title="More options"
                  >
                    ···
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OfficeBuildingClient({
  chatMode,
  defaultModel,
}: {
  chatMode: ChatMode;
  defaultModel: string;
}) {
  const isDisabled = chatMode === "disabled";

  // ── chat state ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  /** Stores the last user message that failed to send, enabling one-click retry. */
  const [failedInput, setFailedInput] = useState<string | null>(null);

  const [model, setModel] = useState(defaultModel || "openclaw:main");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [showTools, setShowTools]   = useState(false);

  // ── conversation state ──────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [convsLoading, setConvsLoading] = useState(true);

  // ── scroll anchor ───────────────────────────────────────────────────────────
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── load conversation list on mount ────────────────────────────────────────
  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((convs: Conversation[]) => setConversations(convs))
      .catch(() => {})
      .finally(() => setConvsLoading(false));
  }, []);

  // ── agent state ─────────────────────────────────────────────────────────────
  const [agents, setAgents]               = useState<{ id: string; name: string }[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>("");
  const [agentTools, setAgentTools]       = useState<{ provider_id: string; action_ids: "*" | string[] }[]>([]);

  // ── tool suggestion state ───────────────────────────────────────────────────
  const [connectedProviders, setConnectedProviders] = useState<SlimProvider[]>([]);
  const [suggestion, setSuggestion]                 = useState<ToolSuggestion | null>(null);

  // Fetch connected providers once on mount for suggestion generation.
  // ToolsPanel fetches the same endpoint independently for its own display.
  useEffect(() => {
    fetch("/api/integrations/tools")
      .then((r) => r.json())
      .then((d: { providers?: SlimProvider[] }) =>
        setConnectedProviders(d.providers ?? [])
      )
      .catch(() => {});
  }, []);

  // Refetch providers each time a suggestion card is shown so the next
  // suggestion uses fresh data (e.g. after a user reconnects a provider
  // mid-session without reloading the page).
  const suggestionActive = suggestion !== null;
  useEffect(() => {
    if (!suggestionActive) return;
    fetch("/api/integrations/tools")
      .then((r) => r.json())
      .then((d: { providers?: SlimProvider[] }) =>
        setConnectedProviders(d.providers ?? [])
      )
      .catch(() => {});
  }, [suggestionActive]);

  // ── fetch agents on mount ───────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d: { agents?: { id: string; name: string }[] }) => setAgents(d.agents ?? []))
      .catch(() => {});
  }, []);

  // ── fetch agent tools when activeAgentId changes ────────────────────────────
  useEffect(() => {
    if (!activeAgentId) { setAgentTools([]); return; }
    fetch(`/api/agents/${activeAgentId}/tools`)
      .then((r) => r.json())
      .then((d: { rules?: { provider_id: string; action_ids: "*" | string[] }[] }) =>
        setAgentTools(d.rules ?? [])
      )
      .catch(() => setAgentTools([]));
  }, [activeAgentId]);

  // ── derived: filteredProviders (for suggestion + ToolsPanel) ────────────────
  const filteredProviders = useMemo(() => {
    if (!activeAgentId) return connectedProviders;
    if (agentTools.length === 0) return [];
    return connectedProviders.flatMap((p) => {
      const at = agentTools.find((t) => t.provider_id === p.provider_id);
      if (!at) return [];
      if (at.action_ids === "*") return [p];
      const acts = p.actions.filter((a) => (at.action_ids as string[]).includes(a.id));
      return acts.length ? [{ ...p, actions: acts }] : [];
    });
  }, [activeAgentId, agentTools, connectedProviders]);

  // ── derived: allowedActions Set for ToolsPanel display filter ───────────────
  const allowedActions = useMemo((): Set<string> | null => {
    if (!activeAgentId) return null;
    return new Set(filteredProviders.flatMap((p) => p.actions.map((a) => `${p.provider_id}:${a.id}`)));
  }, [activeAgentId, filteredProviders]);

  // ── actions ────────────────────────────────────────────────────────────────

  async function selectConversation(conv: Conversation) {
    if (conv.id === activeConversationId || loading) return;
    setActiveConversationId(conv.id);
    setActiveAgentId(conv.agent_id ?? "");
    setMessages([]);
    setError(null);
    setInfoMessage(null);
    setFailedInput(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${conv.id}/messages`);
      const msgs = (await res.json()) as ConvMessage[];
      setMessages(
        msgs
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: m.created_at,
          }))
      );
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Core send function. Adds a user message, calls the gateway, appends
   * the assistant reply. On failure, reverts messages and sets failedInput
   * so the error banner can offer a one-click retry.
   */
  async function sendMessage(text: string) {
    if (!text || loading || isDisabled) return;

    const userMessage: Message = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setError(null);
    setInfoMessage(null);
    setFailedInput(null);
    setSuggestion(null);
    setLoading(true);

    // Ensure a conversation record exists before sending to the gateway.
    let convId = activeConversationId;
    if (!convId) {
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, agent_id: activeAgentId }),
        });
        if (res.ok) {
          const conv = (await res.json()) as Conversation;
          convId = conv.id;
          setActiveConversationId(conv.id);
          setConversations((prev) => [conv, ...prev]);
        }
      } catch {
        // Persistence unavailable — continue without saving
      }
    }

    // Strip client-only timestamp field before sending to the API.
    const apiMessages = [
      ...(systemPrompt.trim()
        ? [{ role: "system" as const, content: systemPrompt.trim() }]
        : []),
      ...nextMessages.map(({ role, content }) => ({ role, content })),
    ];

    try {
      let chatRes = await fetch("/api/openclaw/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          ...(convId ? { conversationId: convId } : {}),
          toolConsentMode: true,
        }),
      });

      let chatRaw: unknown = await chatRes.json();

      // Auto-approve Gmail intent — no consent modal in this view; user explicitly connected Gmail.
      if (chatRes.ok && (chatRaw as { type?: string }).type === "tool_intent") {
        if ((chatRaw as { intent?: { tool?: string } }).intent?.tool === "gmail") {
          chatRes = await fetch("/api/openclaw/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              messages: apiMessages,
              ...(convId ? { conversationId: convId } : {}),
              toolConsentMode: true,
              toolConsentOverride: { tool: "gmail" as const, allowOnce: true as const },
            }),
          });
          chatRaw = await chatRes.json();
        }
      }

      const data = chatRaw as ChatCompletionResponse | { error: string; code?: string };

      if (!chatRes.ok) {
        const msg =
          "error" in data ? data.error : `Request failed (${chatRes.status})`;
        const code = "code" in data ? (data.code ?? "") : "";
        setMessages(messages); // revert to pre-send state
        setFailedInput(text);  // enable one-click retry
        if (INFO_CODES.has(code)) {
          setInfoMessage(msg);
        } else {
          setError(msg);
        }
        return;
      }

      const completion = data as ChatCompletionResponse;
      const assistantContent = completion.choices?.[0]?.message?.content;

      if (!assistantContent) {
        setError("No response received from model.");
        setMessages(messages);
        setFailedInput(text);
        return;
      }

      setMessages([
        ...nextMessages,
        { role: "assistant", content: assistantContent, timestamp: new Date().toISOString() },
      ]);

      // Suggest a tool if the user's message matches a known pattern.
      setSuggestion(suggestTool(text, filteredProviders));

      // Refresh conversation list so the title and updated_at are current.
      if (convId) {
        fetch("/api/conversations")
          .then((r) => r.json())
          .then((convs: Conversation[]) => setConversations(convs))
          .catch(() => {});
      }
    } catch {
      setError("Network error — could not reach the server.");
      setMessages(messages);
      setFailedInput(text);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit() {
    sendMessage(input.trim());
  }

  /** Resends the last failed user message without duplicating conversation state. */
  async function handleRetry() {
    if (!failedInput || loading) return;
    const text = failedInput;
    setFailedInput(null);
    await sendMessage(text);
  }

  /**
   * Regenerates the last assistant response.
   * Removes the last assistant message from local state and re-calls the
   * gateway with the remaining history. The new response is appended in place.
   *
   * Limitation: the previous assistant message is not deleted from the
   * SQLite conversation log, so loading old conversations may show both.
   */
  async function handleRegenerate() {
    if (loading) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return;

    // Capture original messages for rollback on error (closure over current render).
    const originalMessages = messages;
    const truncated = messages.slice(0, -1);

    setMessages(truncated);
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    const apiMessages = [
      ...(systemPrompt.trim()
        ? [{ role: "system" as const, content: systemPrompt.trim() }]
        : []),
      ...truncated.map(({ role, content }) => ({ role, content })),
    ];

    try {
      let regenRes = await fetch("/api/openclaw/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          ...(activeConversationId ? { conversationId: activeConversationId } : {}),
          toolConsentMode: true,
        }),
      });

      let regenRaw: unknown = await regenRes.json();

      if (regenRes.ok && (regenRaw as { type?: string }).type === "tool_intent") {
        if ((regenRaw as { intent?: { tool?: string } }).intent?.tool === "gmail") {
          regenRes = await fetch("/api/openclaw/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              messages: apiMessages,
              ...(activeConversationId ? { conversationId: activeConversationId } : {}),
              toolConsentMode: true,
              toolConsentOverride: { tool: "gmail" as const, allowOnce: true as const },
            }),
          });
          regenRaw = await regenRes.json();
        }
      }

      const data = regenRaw as ChatCompletionResponse | { error: string; code?: string };

      if (!regenRes.ok) {
        setMessages(originalMessages); // restore
        const msg = "error" in data ? data.error : `Request failed (${regenRes.status})`;
        const code = "code" in data ? (data.code ?? "") : "";
        if (INFO_CODES.has(code)) {
          setInfoMessage(msg);
        } else {
          setError(msg);
        }
        return;
      }

      const completion = data as ChatCompletionResponse;
      const assistantContent = completion.choices?.[0]?.message?.content;

      if (!assistantContent) {
        setMessages(originalMessages); // restore
        setError("No response received from model.");
        return;
      }

      setMessages([
        ...truncated,
        { role: "assistant", content: assistantContent, timestamp: new Date().toISOString() },
      ]);

      if (activeConversationId) {
        fetch("/api/conversations")
          .then((r) => r.json())
          .then((convs: Conversation[]) => setConversations(convs))
          .catch(() => {});
      }
    } catch {
      setMessages(originalMessages); // restore
      setError("Network error — could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleCopy(content: string, index: number) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  }

  /** Append a tool result summary to the composer textarea for the user to review and send. */
  function insertToolResult(text: string) {
    setInput((prev) => (prev ? `${prev}\n\n${text}` : text));
  }

  function handleNewChat() {
    setMessages([]);
    setActiveConversationId(null);
    setActiveAgentId("");
    setError(null);
    setInfoMessage(null);
    setInput("");
    setFailedInput(null);
  }

  async function handleDeleteConversation(id: string) {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {});
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) handleNewChat();
  }

  async function handleRenameConversation(id: string, title: string) {
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => {});
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
  }

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div className="flex h-full min-w-0">
      {/* ── Conversation sidebar ──────────────────────────────── */}
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConversationId}
        loading={convsLoading}
        onSelect={selectConversation}
        onNewChat={handleNewChat}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
      />

      {/* ── Main chat panel ───────────────────────────────────── */}
      <div
        className="flex flex-col flex-1 min-w-0"
        style={{ background: P.bg }}
      >
        {/* ── Sub-header ─────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-6 py-3.5 shrink-0"
          style={{
            background: P.card,
            borderBottom: `1px solid ${P.border}`,
          }}
        >
          <div>
            <h1
              className="text-sm font-semibold"
              style={{ color: P.fg }}
            >
              {activeConversationId
                ? (conversations.find((c) => c.id === activeConversationId)?.title ?? "Chat")
                : "Office Building"}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: P.sub }}>
              Chat with your OpenClaw agents
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Tools toggle */}
            <button
              onClick={() => setShowTools((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: showTools ? P.fg   : P.muted,
                color:      showTools ? P.fgLight : P.sub,
                border:     `1px solid ${showTools ? P.fg : P.border}`,
              }}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
              Tools
            </button>

            {/* New chat */}
            {messages.length > 0 && (
              <button
                onClick={handleNewChat}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
                style={{
                  background: P.muted,
                  color: P.sub,
                  border: `1px solid ${P.border}`,
                }}
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New chat
              </button>
            )}
          </div>
        </div>


        {/* ── Conversation ───────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto px-6 py-6"
          style={{ background: P.bg }}
        >
          {isEmpty ? (
            isDisabled ? (
              <DisabledNotice />
            ) : (
              /* Empty state */
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                  style={{
                    background: P.card,
                    border: `1px solid ${P.border}`,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <svg
                    className="w-5 h-5"
                    style={{ color: P.placeholder }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: P.fg }}>
                  Start a conversation
                </p>
                <p className="text-xs mt-3" style={{ color: P.placeholder }}>
                  Press{" "}
                  <kbd
                    className="px-1.5 py-0.5 rounded font-mono"
                    style={{
                      background: P.card,
                      border: `1px solid ${P.border}`,
                      color: P.sub,
                      fontSize: "10px",
                    }}
                  >
                    ⌘ Enter
                  </kbd>{" "}
                  to send
                </p>
              </div>
            )
          ) : (
            <div className="max-w-3xl mx-auto space-y-6 pb-2">
              {messages.map((msg, i) => {
                const isLastMsg = i === messages.length - 1;
                return msg.role === "user" ? (
                  <UserBubble key={i} content={msg.content} timestamp={msg.timestamp} />
                ) : (
                  <AssistantBubble
                    key={i}
                    content={msg.content}
                    onCopy={() => handleCopy(msg.content, i)}
                    copied={copiedIndex === i}
                    timestamp={msg.timestamp}
                    onRegenerate={isLastMsg && !loading ? handleRegenerate : undefined}
                  />
                );
              })}
              {/* Tool suggestion — appears after the last assistant message while not loading */}
              {!loading && suggestion && messages.at(-1)?.role === "assistant" && (
                <ToolSuggestionCard
                  key={`${suggestion.provider_id}:${suggestion.action}`}
                  suggestion={suggestion}
                  onDismiss={() => setSuggestion(null)}
                  onInsert={insertToolResult}
                  conversationId={activeConversationId ?? ""}
                  agentId={activeAgentId}
                />
              )}
              {loading && <ThinkingBubble />}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ── Info banner (amber) ────────────────────────────── */}
        {infoMessage && (
          <InfoBanner
            message={infoMessage}
            onDismiss={() => setInfoMessage(null)}
          />
        )}

        {/* ── Error banner ──────────────────────────────────── */}
        {error && (
          <div
            className="mx-6 mb-2 flex items-start gap-3 rounded-xl px-4 py-3 shrink-0"
            style={{
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.15)",
            }}
          >
            <svg
              className="w-4 h-4 shrink-0 mt-0.5"
              style={{ color: "#dc2626" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="flex-1 text-xs leading-relaxed" style={{ color: "#991b1b" }}>
              {error}
            </p>
            {/* Retry button — only shown when a failed message is available */}
            {failedInput && (
              <button
                onClick={handleRetry}
                className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  color: "#991b1b",
                  border: "1px solid rgba(239,68,68,0.2)",
                }}
              >
                Retry
              </button>
            )}
            <button
              onClick={() => { setError(null); setFailedInput(null); }}
              className="shrink-0 transition-opacity hover:opacity-70"
              style={{ color: "#dc2626" }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Input area ────────────────────────────────────── */}
        <div
          className="px-6 pb-5 pt-3 shrink-0"
          style={{
            background: P.card,
            borderTop: `1px solid ${P.border}`,
          }}
        >
          <div className="max-w-3xl mx-auto">
            <div
              className="relative rounded-2xl transition-all"
              style={{
                background: P.card,
                border: `1px solid ${P.border}`,
                boxShadow: isDisabled
                  ? "none"
                  : "0 1px 3px rgba(0,0,0,0.05)",
                opacity: isDisabled ? 0.5 : 1,
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading || isDisabled}
                rows={3}
                placeholder={
                  isDisabled
                    ? "Chat is not configured — see Settings"
                    : "Send a message…"
                }
                className="w-full bg-transparent px-4 pt-4 pb-12 text-sm focus:outline-none resize-none disabled:cursor-not-allowed"
                style={{
                  color: P.fg,
                }}
              />
              {/* Bottom bar */}
              <div className="absolute bottom-3 left-4 right-3 flex items-center justify-between">
                <span className="text-xs" style={{ color: P.placeholder }}>
                  {loading
                    ? "Thinking…"
                    : isDisabled
                    ? "Chat disabled"
                    : "⌘ Enter to send"}
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !input.trim() || isDisabled}
                  className="flex items-center gap-1.5 text-xs font-medium rounded-xl px-3.5 py-2 transition-all disabled:cursor-not-allowed"
                  style={{
                    background:
                      loading || !input.trim() || isDisabled
                        ? P.muted
                        : P.fg,
                    color:
                      loading || !input.trim() || isDisabled
                        ? P.placeholder
                        : P.fgLight,
                  }}
                >
                  {loading ? (
                    <svg
                      className="animate-spin w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                  )}
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tools panel (right sidebar) ─────────────────────── */}
      {showTools && (
        <ToolsPanel
          onInsert={insertToolResult}
          agentId={activeAgentId}
          conversationId={activeConversationId ?? ""}
          allowedActions={allowedActions}
        />
      )}
    </div>
  );
}
