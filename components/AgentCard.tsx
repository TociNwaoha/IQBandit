/**
 * components/AgentCard.tsx
 * Marketplace agent card — presentational, no state.
 * Can be used in both server and client components.
 */

export interface Agent {
  id: string;
  name: string;
  category: string;
  description: string;
  /** Display string, e.g. "Free", "$19/mo", "Custom" */
  price: string;
  rating: number;
  /** Optional badge: "New" | "Popular" */
  badge?: string;
}

/* ── Category icon definitions ─────────────────────────────── */

const CATEGORY_THEMES: Record<
  string,
  { bg: string; border: string; icon: React.ReactNode }
> = {
  Research: {
    bg: "linear-gradient(135deg, #3730a3 0%, #4f46e5 100%)",
    border: "#4338ca",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
        <circle cx="11" cy="11" r="8" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 8v3m0 0v3m0-3h3m-3 0H8" />
      </svg>
    ),
  },
  Development: {
    bg: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    border: "#334155",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-3 3 3 3M16 9l3 3-3 3M12 5l-2 14" />
      </svg>
    ),
  },
  Writing: {
    bg: "linear-gradient(135deg, #065f46 0%, #059669 100%)",
    border: "#047857",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
  },
  Data: {
    bg: "linear-gradient(135deg, #6b21a8 0%, #9333ea 100%)",
    border: "#7c3aed",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  Analytics: {
    bg: "linear-gradient(135deg, #6b21a8 0%, #9333ea 100%)",
    border: "#7c3aed",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  Support: {
    bg: "linear-gradient(135deg, #92400e 0%, #d97706 100%)",
    border: "#b45309",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  Finance: {
    bg: "linear-gradient(135deg, #064e3b 0%, #10b981 100%)",
    border: "#059669",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  Design: {
    bg: "linear-gradient(135deg, #831843 0%, #ec4899 100%)",
    border: "#db2777",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  Legal: {
    bg: "linear-gradient(135deg, #78350f 0%, #f59e0b 100%)",
    border: "#d97706",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
      </svg>
    ),
  },
  Marketing: {
    bg: "linear-gradient(135deg, #9f1239 0%, #f43f5e 100%)",
    border: "#e11d48",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  },
};

const FALLBACK_THEME = {
  bg: "linear-gradient(135deg, #1e293b 0%, #475569 100%)",
  border: "#334155",
  icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
};

export function AgentCard({ agent }: { agent: Agent }) {
  const theme = CATEGORY_THEMES[agent.category] ?? FALLBACK_THEME;

  return (
    <div className="group relative bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-4 hover:border-gray-300 hover:shadow-md transition-all duration-200 cursor-pointer">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {/* Category image / icon */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
            }}
          >
            {theme.icon}
          </div>
          {/* Category pill */}
          <span className="text-[11px] font-medium text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-2.5 py-0.5 leading-tight">
            {agent.category}
          </span>
        </div>

        {/* Badge */}
        {agent.badge && (
          <span
            className={`shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-0.5 leading-tight ${
              agent.badge === "New"
                ? "bg-violet-50 text-violet-600 border border-violet-100"
                : "bg-amber-50 text-amber-600 border border-amber-100"
            }`}
          >
            {agent.badge}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-gray-900 group-hover:text-violet-700 transition-colors">
          {agent.name}
        </h3>
        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed line-clamp-2">
          {agent.description}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        {/* Rating */}
        <div className="flex items-center gap-1">
          <svg
            className="w-3.5 h-3.5 text-amber-400 fill-amber-400"
            viewBox="0 0 24 24"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <span className="text-xs font-semibold text-gray-700">
            {agent.rating.toFixed(1)}
          </span>
        </div>

        {/* Price + CTA */}
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-gray-900">
            {agent.price}
          </span>
          <span className="text-xs font-medium text-violet-600 group-hover:text-violet-700 group-hover:underline transition-colors">
            Try agent →
          </span>
        </div>
      </div>
    </div>
  );
}
