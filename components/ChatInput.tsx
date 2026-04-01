"use client";

import {
  useState,
  useCallback,
  memo,
  forwardRef,
  useImperativeHandle,
  type KeyboardEvent,
} from "react";

// Palette mirrors OfficeBuildingClient — CSS vars so theme changes propagate.
const P = {
  bg:          "var(--color-bg-base)",
  card:        "var(--color-bg-surface)",
  muted:       "var(--color-bg-surface-2)",
  fg:          "var(--color-text-primary)",
  fgLight:     "var(--color-bg-base)",
  border:      "var(--color-border)",
  sub:         "var(--color-text-secondary)",
  placeholder: "var(--color-text-muted)",
} as const;

export interface ChatInputHandle {
  /** Appends text into the textarea, separated by a blank line if there is existing content. */
  insertText: (text: string) => void;
  /** Clears the textarea. */
  clear: () => void;
}

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  researchMode: boolean;
  onToggleResearch: () => void;
  searching: boolean;
  searchQuery: string | null;
  searchesUsed: number | null;
  searchesLimit: number | null;
  disabled?: boolean;
}

export const ChatInput = memo(
  forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
    {
      onSend,
      isLoading,
      researchMode,
      onToggleResearch,
      searching,
      searchQuery,
      searchesUsed,
      searchesLimit,
      disabled = false,
    },
    ref
  ) {
    const [text, setText] = useState("");

    useImperativeHandle(ref, () => ({
      insertText: (t: string) =>
        setText((prev) => (prev ? `${prev}\n\n${t}` : t)),
      clear: () => setText(""),
    }));

    const handleSend = useCallback(() => {
      if (!text.trim() || isLoading || disabled) return;
      onSend(text.trim());
      setText("");
    }, [text, isLoading, disabled, onSend]);

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          handleSend();
        }
      },
      [handleSend]
    );

    return (
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
              boxShadow: disabled ? "none" : "0 1px 3px rgba(0,0,0,0.05)",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || disabled}
              rows={3}
              placeholder={
                disabled
                  ? "Chat is not configured — see Settings"
                  : "Send a message…"
              }
              className="w-full bg-transparent px-4 pt-4 pb-12 text-sm focus:outline-none resize-none disabled:cursor-not-allowed"
              style={{ color: P.fg }}
            />
            {/* Bottom bar */}
            <div className="absolute bottom-3 left-4 right-3 flex items-center justify-between">
              <span className="text-xs" style={{ color: P.placeholder }}>
                {searching && searchQuery
                  ? `🔍 Searching "${searchQuery.slice(0, 35)}…"`
                  : isLoading
                  ? "Thinking…"
                  : disabled
                  ? "Chat disabled"
                  : "⌘ Enter to send"}
              </span>
              <div className="flex items-center gap-2">
                {researchMode && searchesUsed !== null && searchesLimit !== null && (
                  <span className="text-xs" style={{ color: P.placeholder }}>
                    {searchesUsed}/{searchesLimit} searches today
                  </span>
                )}
                <button
                  onClick={onToggleResearch}
                  disabled={disabled}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full transition-all disabled:cursor-not-allowed"
                  style={{
                    background: researchMode ? P.fg : P.muted,
                    color:      researchMode ? P.fgLight : P.placeholder,
                    border:     `1px solid ${P.border}`,
                  }}
                  title={
                    researchMode
                      ? "Research Mode ON — searches web before answering"
                      : "Research Mode OFF"
                  }
                >
                  🔍 {researchMode ? "Research ON" : "Research"}
                </button>
                <button
                  onClick={handleSend}
                  disabled={isLoading || !text.trim() || disabled}
                  className="flex items-center gap-1.5 text-xs font-medium rounded-xl px-3.5 py-2 transition-all disabled:cursor-not-allowed"
                  style={{
                    background:
                      isLoading || !text.trim() || disabled ? P.muted : P.fg,
                    color:
                      isLoading || !text.trim() || disabled
                        ? P.placeholder
                        : P.fgLight,
                  }}
                >
                  {isLoading ? (
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
  })
);
