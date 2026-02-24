import type { ReactNode } from "react";

// ── Shared card shell used by all three mock visuals ─────────────────────────

function VisualCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden">
      {children}
    </div>
  );
}

// ── Reusable section layout ───────────────────────────────────────────────────

interface FeatureSplitSectionProps {
  eyebrow: string;
  heading: string;
  body: string;
  visual: ReactNode;
  reversed?: boolean;
}

export function FeatureSplitSection({
  eyebrow,
  heading,
  body,
  visual,
  reversed = false,
}: FeatureSplitSectionProps) {
  return (
    <section
      className={`max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-24 flex flex-col ${
        reversed ? "md:flex-row-reverse" : "md:flex-row"
      } items-center gap-12 lg:gap-20`}
    >
      {/* Text block */}
      <div className="flex-1 space-y-5 max-w-md">
        {/* Eyebrow with a colored dot accent */}
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            {eyebrow}
          </span>
        </div>

        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-[1.1] tracking-tight">
          {heading}
        </h2>

        <p className="text-gray-500 text-base sm:text-[17px] leading-relaxed">
          {body}
        </p>
      </div>

      {/* Visual block */}
      <div className="flex-1 w-full max-w-md mx-auto">{visual}</div>
    </section>
  );
}

// ── Mock visual 1: Dedicated server ──────────────────────────────────────────

export function ServerVisual() {
  const metrics = [
    { label: "Region", value: "US-East" },
    { label: "Runtime", value: "Node 20 LTS" },
    { label: "Memory", value: "512 MB" },
    { label: "Uptime", value: "99.98%" },
  ];

  return (
    <VisualCard>
      <div className="p-6 space-y-5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <rect x="1" y="2" width="12" height="4" rx="1" fill="white" opacity="0.9" />
                <rect x="1" y="8" width="12" height="4" rx="1" fill="white" opacity="0.5" />
                <circle cx="11" cy="4" r="1" fill="#4ade80" />
                <circle cx="11" cy="10" r="1" fill="white" opacity="0.4" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-900">
              my-agent-server
            </span>
          </div>

          {/* Live badge with pulsing dot */}
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-semibold bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
            <span className="relative flex w-1.5 h-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-500" />
            </span>
            Live
          </span>
        </div>

        {/* Metrics list */}
        <div className="space-y-1.5">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5"
            >
              <span className="text-xs text-gray-400 font-medium">
                {m.label}
              </span>
              <span className="text-xs font-semibold text-gray-700">
                {m.value}
              </span>
            </div>
          ))}
        </div>

        {/* CPU bar */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 font-medium">
              CPU usage
            </span>
            <span className="text-xs font-semibold text-gray-700">74%</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            {/* 74% fill */}
            <div className="h-1.5 rounded-full bg-gray-900 w-[74%]" />
          </div>
        </div>

        {/* Footer timestamp */}
        <p className="text-[11px] text-gray-400">
          Last deployed · 3 mins ago from{" "}
          <span className="font-semibold text-gray-600">main</span>
        </p>
      </div>
    </VisualCard>
  );
}

// ── Mock visual 2: Chat interface ─────────────────────────────────────────────

const CHAT_MESSAGES = [
  { from: "user" as const, text: "Summarize my sales report from last week" },
  {
    from: "agent" as const,
    text: "Revenue was up 12% WoW, with 847 new leads and 23 closed deals. Top tier: Enterprise.",
  },
  { from: "user" as const, text: "What were the top 3 channels?" },
];

export function ChatVisual() {
  return (
    <VisualCard>
      {/* Chat header */}
      <div className="border-b border-gray-100 px-5 py-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
          <span className="text-white text-[10px] font-black">IQ</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-gray-900 leading-none mb-0.5">
            IQBANDIT Agent
          </p>
          <p className="text-[11px] text-gray-400">Online · Telegram</p>
        </div>
        {/* Online indicator */}
        <span className="relative flex w-2 h-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" />
        </span>
      </div>

      {/* Message thread */}
      <div className="p-5 space-y-3 bg-gray-50/40">
        {CHAT_MESSAGES.map((msg, i) => (
          <div
            key={i}
            className={`flex ${
              msg.from === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                msg.from === "user"
                  ? "bg-gray-900 text-white rounded-br-sm"
                  : "bg-white text-gray-700 border border-gray-200 rounded-bl-sm shadow-sm"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        <div className="flex justify-start">
          <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center shadow-sm">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-gray-100 bg-white px-4 py-3 flex items-center gap-2">
        <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-400">
          Message your agent…
        </div>
        {/* Send button */}
        <button className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center shrink-0 hover:bg-black transition-colors">
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M10 1L5.5 5.5M10 1H6.5M10 1V4.5"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M1 10L5.5 5.5"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </VisualCard>
  );
}

// ── Mock visual 3: Capabilities panel ────────────────────────────────────────

const CAPABILITY_ITEMS = [
  { emoji: "🔍", label: "Web Search", active: true },
  { emoji: "📊", label: "Data Analysis", active: true },
  { emoji: "📧", label: "Send Emails", active: true },
  { emoji: "📅", label: "Calendar Access", active: false },
];

export function CapabilitiesVisual() {
  return (
    <VisualCard>
      <div className="p-6 space-y-3.5">
        {/* Panel header */}
        <div className="flex items-center justify-between pb-1">
          <span className="text-[13px] font-bold text-gray-900 tracking-tight">
            Agent Capabilities
          </span>
          <span className="text-xs font-semibold text-blue-600 cursor-pointer hover:text-blue-700 transition-colors">
            + Add tool
          </span>
        </div>

        {/* Capability rows */}
        {CAPABILITY_ITEMS.map((cap) => (
          <div
            key={cap.label}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors duration-150"
          >
            <span className="text-[15px] leading-none shrink-0">
              {cap.emoji}
            </span>
            <span className="flex-1 text-[13px] font-medium text-gray-700">
              {cap.label}
            </span>

            {/* Toggle pill */}
            <div
              className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${
                cap.active ? "bg-gray-900" : "bg-gray-200"
              }`}
            >
              <div
                className={`absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  cap.active ? "translate-x-[18px]" : "translate-x-[3px]"
                }`}
              />
            </div>
          </div>
        ))}

        {/* Footer note */}
        <p className="text-[11px] text-gray-400 pt-1">
          Changes apply instantly — no redeploy needed.
        </p>
      </div>
    </VisualCard>
  );
}
