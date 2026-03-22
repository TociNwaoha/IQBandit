"use client";

/**
 * components/PlatformBadge.tsx
 * Small badge showing platform connection status.
 * Used in agent cards and the connections page.
 */

export type PlatformId = "twitter" | "instagram" | "linkedin" | "threads";
export type PlatformStatus = "connected" | "coming_soon" | "not_connected";

interface PlatformBadgeProps {
  platform: PlatformId;
  status: PlatformStatus;
  handle?: string;
}

const PLATFORM_CONFIG: Record<PlatformId, { icon: string; label: string }> = {
  twitter:   { icon: "𝕏",  label: "X" },
  instagram: { icon: "📸", label: "Instagram" },
  linkedin:  { icon: "💼", label: "LinkedIn" },
  threads:   { icon: "🧵", label: "Threads" },
};

export function PlatformBadge({ platform, status, handle }: PlatformBadgeProps) {
  const config = PLATFORM_CONFIG[platform];

  if (status === "connected") {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
        style={{ background: "var(--color-bg-surface-2)", border: "1px solid var(--color-border-hover)" }}
      >
        <span className="text-sm">{config.icon}</span>
        <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{handle ?? config.label}</span>
        <span className="text-xs text-emerald-400">✓</span>
      </div>
    );
  }

  if (status === "coming_soon") {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
        style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}
      >
        <span className="text-sm opacity-40">{config.icon}</span>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{config.label}</span>
        <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>coming soon</span>
      </div>
    );
  }

  // not_connected
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border-amber-900/40"
      style={{ background: "var(--color-bg-surface)", border: "1px solid rgba(120,53,15,0.4)" }}
    >
      <span className="text-sm">{config.icon}</span>
      <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{config.label}</span>
      <span className="text-[10px] text-amber-500">Connect →</span>
    </div>
  );
}
