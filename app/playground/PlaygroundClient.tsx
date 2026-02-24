"use client";

/**
 * app/playground/PlaygroundClient.tsx
 * Interactive chat playground — premium light theme.
 * Calls /api/openclaw/chat — never touches the gateway directly.
 *
 * chatMode prop is set server-side from STARTCLAW_CHAT_MODE:
 *   "openclaw" — normal operation
 *   "disabled" — input is locked, DisabledNotice shown instead of empty state
 */

import { useRef, useEffect, useState, KeyboardEvent } from "react";
import type { ChatCompletionResponse } from "@/lib/openclaw";
import type { ChatMode } from "@/lib/llm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  role: "user" | "assistant";
  content: string;
}

// Codes that mean "not configured" — show amber info, not red error
const INFO_CODES = new Set([
  "CHAT_DISABLED",
  "ENDPOINT_NOT_FOUND",
  "NOT_REST_COMPATIBLE",
]);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[78%] bg-gray-900 rounded-2xl rounded-tr-sm px-4 py-3">
        <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">
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
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3">
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {content}
          </p>
        </div>
        {/* Copy — appears on hover */}
        <button
          onClick={onCopy}
          className="absolute -bottom-6 left-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
        >
          {copied ? (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
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
      <div className="bg-white border border-gray-200 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
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
      <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-4">
        <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-gray-800">
        No REST endpoint configured
      </p>
      <p className="text-xs text-gray-500 mt-1.5 max-w-xs leading-relaxed">
        The OpenClaw gateway is running, but the REST chat API isn&apos;t wired
        up yet. Dashboard and health checks still work.
      </p>
      <div className="mt-5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-left max-w-xs w-full">
        <p className="text-xs text-gray-500 mb-1.5">
          To enable chat, set in{" "}
          <span className="font-mono text-gray-700">.env.local</span>:
        </p>
        <code className="text-xs text-violet-700 font-mono">
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
    <div className="mx-6 mb-2 flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 shrink-0">
      <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="flex-1 text-xs text-amber-700 leading-relaxed">{message}</p>
      <button onClick={onDismiss} className="text-amber-400 hover:text-amber-600 shrink-0">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PlaygroundClient({ chatMode }: { chatMode: ChatMode }) {
  const isDisabled = chatMode === "disabled";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Config — change default model to match your gateway
  const [model, setModel] = useState("gpt-4o");
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
    <div className="flex flex-col h-full bg-white min-w-0">
      {/* Sub-header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 shrink-0">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Playground</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Test your gateway models
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig((v) => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              showConfig
                ? "bg-gray-100 border-gray-200 text-gray-900"
                : "border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Config
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New chat
            </button>
          )}
        </div>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="bg-gray-50 border-b border-gray-100 px-6 py-4 shrink-0">
          <div className="flex flex-col sm:flex-row gap-4 max-w-2xl">
            <div className="flex flex-col gap-1.5 w-full sm:w-44">
              <label className="text-xs font-medium text-gray-600">
                Model
                <span className="ml-1 font-normal text-gray-400">
                  (match gateway)
                </span>
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 transition-all"
                placeholder="gpt-4o"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs font-medium text-gray-600">
                System prompt
                <span className="ml-1 font-normal text-gray-400">
                  (optional)
                </span>
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={2}
                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 transition-all resize-none"
                placeholder="You are a helpful assistant…"
              />
            </div>
          </div>
        </div>
      )}

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-6 py-6 bg-gray-50/40">
        {isEmpty ? (
          isDisabled ? (
            <DisabledNotice />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700">
                Start a conversation
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Model:{" "}
                <span className="font-mono text-gray-500">{model}</span>
                {systemPrompt && <> · System prompt active</>}
              </p>
              <p className="text-xs text-gray-300 mt-3">
                Press{" "}
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-400 text-[10px]">
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

      {/* Info banner (amber) */}
      {infoMessage && (
        <InfoBanner
          message={infoMessage}
          onDismiss={() => setInfoMessage(null)}
        />
      )}

      {/* Error banner (red) */}
      {error && (
        <div className="mx-6 mb-2 flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3 shrink-0">
          <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="flex-1 text-xs text-red-600 leading-relaxed">{error}</p>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-red-500 shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="px-6 pb-5 pt-3 shrink-0 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto">
          <div
            className={`relative bg-white border rounded-2xl transition-all ${
              isDisabled
                ? "border-gray-200 opacity-50 cursor-not-allowed"
                : "border-gray-200 shadow-sm focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-500/10"
            }`}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading || isDisabled}
              rows={3}
              placeholder={
                isDisabled
                  ? "Chat is not configured — see settings"
                  : "Send a message…"
              }
              className="w-full bg-transparent px-4 pt-4 pb-12 text-sm text-gray-900 placeholder-gray-400 focus:outline-none resize-none disabled:cursor-not-allowed"
            />
            <div className="absolute bottom-3 left-4 right-3 flex items-center justify-between">
              <span className="text-xs text-gray-300">
                {loading
                  ? "Thinking…"
                  : isDisabled
                  ? "Chat disabled"
                  : "⌘ Enter to send"}
              </span>
              <button
                onClick={handleSubmit}
                disabled={loading || !input.trim() || isDisabled}
                className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-xs font-medium rounded-xl px-3.5 py-2 transition-colors"
              >
                {loading ? (
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
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
