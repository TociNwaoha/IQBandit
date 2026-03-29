"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === "user";

  // Strip trailing streaming cursor character when we show our own animated cursor
  const displayContent =
    isStreaming && content.endsWith("▌") ? content.slice(0, -1) : content;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser ? "rounded-br-sm" : "rounded-bl-sm"
        }`}
        style={{
          background: isUser
            ? "var(--color-bg-base)"
            : "var(--color-bg-surface)",
          color: isUser
            ? "var(--color-text-primary)"
            : "var(--color-text-primary)",
          border: isUser
            ? "none"
            : "1px solid var(--color-border)",
          boxShadow: isUser ? "none" : "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        {role === "system" ? (
          <p
            className="text-xs italic"
            style={{ color: "var(--color-text-muted)" }}
          >
            {displayContent}
          </p>
        ) : isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap"
            style={{
              color: "var(--color-text-primary)",
            }}
          >
            {displayContent}
          </p>
        ) : (
          <div className="prose prose-sm max-w-none chat-prose">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-lg font-bold mt-4 mb-2 first:mt-0" style={{ color: "var(--color-text-primary)" }}>{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-base font-bold mt-3 mb-1.5 first:mt-0" style={{ color: "var(--color-text-primary)" }}>{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0" style={{ color: "var(--color-text-primary)" }}>{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="text-sm leading-relaxed mb-3 last:mb-0" style={{ color: "var(--color-text-primary)" }}>{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic" style={{ color: "var(--color-text-secondary)" }}>{children}</em>
                ),
                code: ({ className, children }) => {
                  const content = String(children);
                  // Remark always appends \n to block code; inline code never ends with \n
                  const isBlock = content.endsWith("\n") || className?.includes("language-");
                  if (isBlock) {
                    return (
                      <code
                        className="block text-xs leading-relaxed font-mono p-3 rounded-lg overflow-x-auto"
                        style={{
                          background: "var(--color-bg-base)",
                          color: "var(--color-accent)",
                          border: "1px solid var(--color-border)",
                        }}
                      >
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code
                      className="text-xs font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: "var(--color-bg-base)",
                        color: "var(--color-accent)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => (
                  <pre
                    className="rounded-xl overflow-hidden mb-3 last:mb-0"
                    style={{
                      background: "var(--color-bg-base)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    {children}
                  </pre>
                ),
                ul: ({ children }) => (
                  <ul className="text-sm mb-3 last:mb-0 space-y-1 pl-4" style={{ listStyleType: "disc", color: "var(--color-text-primary)" }}>{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="text-sm mb-3 last:mb-0 space-y-1 pl-4" style={{ listStyleType: "decimal", color: "var(--color-text-primary)" }}>{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="text-sm leading-relaxed" style={{ color: "var(--color-text-primary)" }}>{children}</li>
                ),
                blockquote: ({ children }) => (
                  <blockquote
                    className="pl-3 my-2 text-sm italic"
                    style={{
                      borderLeft: "3px solid var(--color-accent)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {children}
                  </blockquote>
                ),
                hr: () => (
                  <hr
                    className="my-3"
                    style={{ borderColor: "var(--color-border)" }}
                  />
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 text-sm"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {children}
                  </a>
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto mb-3 last:mb-0 rounded-lg" style={{ border: "1px solid var(--color-border)" }}>
                    <table className="text-xs w-full">{children}</table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead style={{ background: "var(--color-bg-base)" }}>{children}</thead>
                ),
                th: ({ children }) => (
                  <th
                    className="text-left px-3 py-2 font-semibold"
                    style={{
                      color: "var(--color-text-secondary)",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td
                    className="px-3 py-2"
                    style={{
                      color: "var(--color-text-primary)",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    {children}
                  </td>
                ),
              }}
            >
              {displayContent}
            </ReactMarkdown>
            {isStreaming && (
              <span
                className="inline-block w-0.5 h-3.5 ml-0.5 animate-pulse rounded-full align-middle"
                style={{ background: "var(--color-accent)" }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
