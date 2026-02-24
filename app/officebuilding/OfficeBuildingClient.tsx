"use client";

/**
 * app/officebuilding/OfficeBuildingClient.tsx
 * Chat workspace — StartClaw design language.
 * Palette: #F7F7F4 bg · #FFFFFF card · #F0F0EC muted · #1A1A17 fg · #E8E8E4 border
 */

import { useRef, useEffect, useState, KeyboardEvent } from "react";
import type { ChatCompletionResponse } from "@/lib/openclaw";
import type { ChatMode } from "@/lib/llm";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[78%] rounded-2xl rounded-tr-sm px-4 py-3"
        style={{ background: P.fg }}
      >
        <p
          className="text-sm whitespace-pre-wrap leading-relaxed"
          style={{ color: P.fgLight }}
        >
          {content}
        </p>
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  onCopy,
  copied,
}: {
  content: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex justify-start group">
      <div className="max-w-[78%] relative">
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
        {/* Copy button — appears on hover */}
        <button
          onClick={onCopy}
          className="absolute -bottom-6 left-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs"
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

// ─── Main component ───────────────────────────────────────────────────────────

export function OfficeBuildingClient({
  chatMode,
  defaultModel,
}: {
  chatMode: ChatMode;
  defaultModel: string;
}) {
  const isDisabled = chatMode === "disabled";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const [model, setModel] = useState(defaultModel || "openclaw:main");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showConfig, setShowConfig] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || loading || isDisabled) return;

    const userMessage: Message = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    const apiMessages = [
      ...(systemPrompt.trim()
        ? [{ role: "system" as const, content: systemPrompt.trim() }]
        : []),
      ...nextMessages,
    ];

    try {
      const res = await fetch("/api/openclaw/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: apiMessages }),
      });

      const data: ChatCompletionResponse | { error: string; code?: string } =
        await res.json();

      if (!res.ok) {
        const msg =
          "error" in data ? data.error : `Request failed (${res.status})`;
        const code = "code" in data ? (data.code ?? "") : "";
        setMessages(messages);
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
        return;
      }

      setMessages([
        ...nextMessages,
        { role: "assistant", content: assistantContent },
      ]);
    } catch {
      setError("Network error — could not reach the server.");
      setMessages(messages);
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

  function handleNewChat() {
    setMessages([]);
    setError(null);
    setInfoMessage(null);
    setInput("");
  }

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div
      className="flex flex-col h-full min-w-0"
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
            Office Building
          </h1>
          <p className="text-xs mt-0.5" style={{ color: P.sub }}>
            Chat with your OpenClaw agents
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Config toggle */}
          <button
            onClick={() => setShowConfig((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: showConfig ? P.fg : P.muted,
              color: showConfig ? P.fgLight : P.sub,
              border: `1px solid ${showConfig ? P.fg : P.border}`,
            }}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Config
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

      {/* ── Config panel ───────────────────────────────────── */}
      {showConfig && (
        <div
          className="px-6 py-4 shrink-0"
          style={{
            background: P.muted,
            borderBottom: `1px solid ${P.border}`,
          }}
        >
          <div className="flex flex-col sm:flex-row gap-4 max-w-2xl">
            <div className="flex flex-col gap-1.5 w-full sm:w-44">
              <label className="text-xs font-medium" style={{ color: P.sub }}>
                Model{" "}
                <span className="font-normal" style={{ color: P.placeholder }}>
                  (match gateway)
                </span>
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="rounded-xl px-3 py-2 text-sm outline-none transition-all"
                style={{
                  background: P.card,
                  border: `1px solid ${P.border}`,
                  color: P.fg,
                }}
                placeholder="openclaw:main"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs font-medium" style={{ color: P.sub }}>
                System prompt{" "}
                <span className="font-normal" style={{ color: P.placeholder }}>
                  (optional)
                </span>
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={2}
                className="rounded-xl px-3 py-2 text-sm outline-none transition-all resize-none"
                style={{
                  background: P.card,
                  border: `1px solid ${P.border}`,
                  color: P.fg,
                }}
                placeholder="You are a helpful assistant…"
              />
            </div>
          </div>
        </div>
      )}

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
              <p className="text-xs mt-1" style={{ color: P.sub }}>
                Model:{" "}
                <span className="font-mono" style={{ color: P.fg }}>
                  {model}
                </span>
                {systemPrompt && (
                  <span style={{ color: P.sub }}> · System prompt active</span>
                )}
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
            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <UserBubble key={i} content={msg.content} />
              ) : (
                <AssistantBubble
                  key={i}
                  content={msg.content}
                  onCopy={() => handleCopy(msg.content, i)}
                  copied={copiedIndex === i}
                />
              )
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
          <button
            onClick={() => setError(null)}
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
  );
}
